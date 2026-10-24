"""Synthetic per-product LightGBM quantile forecaster and Supabase loader."""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import lightgbm as lgb
import numpy as np
import pandas as pd

FEATURES = [
    "dayofweek",
    "month",
    "is_weekend",
    "lag_7",
    "lag_14",
    "lag_28",
    "rolling_mean_7",
    "rolling_std_7",
]
QUANTILES = (0.1, 0.5, 0.9)
DEFAULT_CONFIG = Path(__file__).with_name("products.json")
DATABASE_FIELDS = (
    "forecast_date",
    "product_id",
    "p10",
    "p50",
    "p90",
    "generated_at",
)


def load_config(path: str | Path = DEFAULT_CONFIG) -> dict[str, Any]:
    """Load and validate the non-secret synthetic product catalog."""
    config_path = Path(path)
    with config_path.open("r", encoding="utf-8") as config_file:
        config = json.load(config_file)

    products = config.get("products")
    if config.get("synthetic_data") is not True:
        raise ValueError("products config must explicitly set synthetic_data=true")
    if not isinstance(products, list) or not 3 <= len(products) <= 5:
        raise ValueError("products config must contain 3 to 5 demo products")
    if int(config.get("units_per_box", 0)) != 40:
        raise ValueError("units_per_box must be 40 to match the D3 demo scale")
    data_label = str(config.get("data_label", "")).upper()
    if "SYNTHETIC" not in data_label and "SIMULATED" not in data_label:
        raise ValueError("data_label must visibly identify the series as synthetic or simulated")

    ids: set[str] = set()
    weights: set[float] = set()
    for product in products:
        required = ("product_id", "name", "category", "weight_kg", "shelf_life_days", "base_daily_units")
        if any(key not in product for key in required):
            raise ValueError("each product needs id, name, category, weight, shelf life, and synthetic base demand")
        product_id = str(product["product_id"])
        weight = float(product["weight_kg"])
        base_demand = float(product["base_daily_units"])
        if product_id in ids or weight in weights:
            raise ValueError("demo product IDs and weights must be distinct")
        if weight <= 0 or base_demand <= 0:
            raise ValueError("product weight and base_daily_units must be positive")
        ids.add(product_id)
        weights.add(weight)

    config["history_days"] = int(config.get("history_days", 1461))
    config["seed"] = int(config.get("seed", 42))
    if config["history_days"] < 120:
        raise ValueError("history_days must be at least 120 for lag features and evaluation")
    return config


def generate_synthetic_series(
    product: dict[str, Any],
    *,
    history_days: int = 1461,
    seed: int = 42,
    target: str = "units_per_day",
    units_per_box: int = 40,
    end_date: date | None = None,
) -> pd.DataFrame:
    """Create one explicitly synthetic daily series at the configured D3 scale."""
    if target not in {"units_per_day", "boxes_per_day"}:
        raise ValueError("target must be units_per_day or boxes_per_day")
    if history_days < 60:
        raise ValueError("history_days must be at least 60")
    if end_date is None:
        end_date = date.today() - timedelta(days=1)
    dates = pd.date_range(end=end_date, periods=history_days, freq="D")
    base = float(product["base_daily_units"])
    rng = np.random.default_rng(seed)

    trend = np.linspace(0.95, 1.05, history_days) * base
    seasonal = 0.12 * base * np.sin(2 * np.pi * dates.day_of_year.to_numpy() / 365.25)
    weekday_factor = np.where(dates.day_of_week.to_numpy() >= 5, 1.08, 1.0)
    noise = rng.normal(0.0, base * 0.12, history_days)
    spikes = np.where(
        rng.random(history_days) > 0.985,
        rng.uniform(base * 0.4, base * 0.8, history_days),
        0.0,
    )
    values_units = np.maximum(0.0, trend * weekday_factor + seasonal + noise + spikes)
    if target == "boxes_per_day":
        values = values_units / units_per_box
    else:
        values = values_units

    return pd.DataFrame({"date": dates, target: values})


def add_features(series: pd.DataFrame, target: str) -> pd.DataFrame:
    frame = series.copy()
    frame["dayofweek"] = frame["date"].dt.day_of_week
    frame["month"] = frame["date"].dt.month
    frame["is_weekend"] = frame["dayofweek"].isin([5, 6]).astype(int)
    for lag in (7, 14, 28):
        frame[f"lag_{lag}"] = frame[target].shift(lag)
    frame["rolling_mean_7"] = frame[target].shift(1).rolling(window=7).mean()
    frame["rolling_std_7"] = frame[target].shift(1).rolling(window=7).std()
    return frame.dropna().reset_index(drop=True)


def fit_quantile_models(
    training: pd.DataFrame,
    target: str,
    *,
    seed: int,
    num_boost_round: int,
) -> list[lgb.Booster]:
    train_data = lgb.Dataset(training[FEATURES], label=training[target])
    models = []
    for quantile in QUANTILES:
        params = {
            "objective": "quantile",
            "alpha": float(quantile),
            "seed": int(seed),
            "verbosity": -1,
            "num_threads": 1,
            "force_col_wise": True,
        }
        models.append(lgb.train(params, train_data, num_boost_round=num_boost_round))
    return models


def _next_day_features(history_values: list[float], forecast_day: pd.Timestamp) -> pd.DataFrame:
    values = np.asarray(history_values, dtype=float)
    row = {
        "dayofweek": int(forecast_day.day_of_week),
        "month": int(forecast_day.month),
        "is_weekend": int(forecast_day.day_of_week >= 5),
        "lag_7": values[-7],
        "lag_14": values[-14],
        "lag_28": values[-28],
        "rolling_mean_7": float(np.mean(values[-7:])),
        "rolling_std_7": float(np.std(values[-7:], ddof=1)),
    }
    return pd.DataFrame([row], columns=FEATURES)


def _ordered_nonnegative(values: Any) -> np.ndarray:
    return np.maximum.accumulate(np.maximum(np.asarray(values, dtype=float), 0.0))


def generate_forecast_rows(
    config: dict[str, Any],
    *,
    horizon: int = 14,
    target: str = "units_per_day",
    history_days: int | None = None,
    seed: int | None = None,
    forecast_start: date | None = None,
    generated_at: str | None = None,
    num_boost_round: int = 100,
) -> list[dict[str, Any]]:
    """Train one quantile model per product and recursively forecast forward."""
    if not 1 <= int(horizon) <= 365:
        raise ValueError("horizon must be between 1 and 365 days")
    if target not in {"units_per_day", "boxes_per_day"}:
        raise ValueError("target must be units_per_day or boxes_per_day")

    history_days = int(history_days or config["history_days"])
    seed = int(config["seed"] if seed is None else seed)
    units_per_box = int(config["units_per_box"])
    if forecast_start is None:
        forecast_start = date.today()
    if generated_at is None:
        generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    rows: list[dict[str, Any]] = []
    for product_index, product in enumerate(config["products"]):
        product_seed = seed + product_index * 1009
        series = generate_synthetic_series(
            product,
            history_days=history_days,
            seed=product_seed,
            target=target,
            units_per_box=units_per_box,
            end_date=forecast_start - timedelta(days=1),
        )
        training = add_features(series, target)
        models = fit_quantile_models(
            training,
            target,
            seed=product_seed,
            num_boost_round=num_boost_round,
        )
        history_values = series[target].astype(float).tolist()
        output_multiplier = units_per_box if target == "boxes_per_day" else 1.0

        for step in range(int(horizon)):
            forecast_day = pd.Timestamp(forecast_start + timedelta(days=step))
            features = _next_day_features(history_values, forecast_day)
            model_values = _ordered_nonnegative([model.predict(features)[0] for model in models])
            unit_values = _ordered_nonnegative(model_values * output_multiplier)
            rounded = [round(float(value), 3) for value in unit_values]
            # Rounding cannot reverse the order, but the final clamp makes the
            # table constraints explicit even for near-zero predictions.
            rounded = [max(0.0, value) for value in rounded]
            rows.append({
                "forecast_date": forecast_day.date().isoformat(),
                "product_id": product["product_id"],
                "p10": rounded[0],
                "p50": rounded[1],
                "p90": rounded[2],
                "generated_at": generated_at,
            })
            # Recursive lags use the median, retaining actual history only up to
            # the day before the first forecast.
            history_values.append(float(model_values[1]))

    return rows


def evaluate_history(
    config: dict[str, Any],
    *,
    target: str = "units_per_day",
    history_days: int | None = None,
    num_boost_round: int = 100,
) -> list[dict[str, float | str]]:
    """Optional one-step evaluation on the final 90 synthetic historical days."""
    history_days = int(history_days or config["history_days"])
    results: list[dict[str, float | str]] = []
    for product_index, product in enumerate(config["products"]):
        product_seed = int(config["seed"]) + product_index * 1009
        series = generate_synthetic_series(
            product,
            history_days=history_days,
            seed=product_seed,
            target=target,
            units_per_box=int(config["units_per_box"]),
        )
        frame = add_features(series, target)
        if len(frame) <= 90:
            raise ValueError("history is too short for the 90-day evaluation split")
        training, testing = frame.iloc[:-90], frame.iloc[-90:]
        models = fit_quantile_models(
            training,
            target,
            seed=product_seed,
            num_boost_round=num_boost_round,
        )
        predictions = _ordered_nonnegative(
            [model.predict(testing[FEATURES]) for model in models]
        )
        factor = int(config["units_per_box"]) if target == "boxes_per_day" else 1
        predictions *= factor
        actual = testing[target].to_numpy(dtype=float) * factor
        median = predictions[1]
        results.append({
            "product": str(product["name"]),
            "mae": float(np.mean(np.abs(actual - median))),
            "rmse": float(np.sqrt(np.mean((actual - median) ** 2))),
            "coverage": float(np.mean((actual >= predictions[0]) & (actual <= predictions[2]))),
        })
    return results


def output_document(config: dict[str, Any], rows: list[dict[str, Any]], target: str) -> dict[str, Any]:
    return {
        "data_label": str(config["data_label"]),
        "forecast_meaning": "expected units to arrive per day",
        "model_target": target,
        "units_per_box": int(config["units_per_box"]),
        "rows": rows,
    }


def write_output(path: str | Path, document: dict[str, Any]) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rows = document["rows"]
    if output_path.suffix.lower() == ".json":
        output_path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    elif output_path.suffix.lower() == ".csv":
        with output_path.open("w", newline="", encoding="utf-8") as output_file:
            output_file.write("# SYNTHETIC / SIMULATED FORECAST; NOT REAL DEMAND\n")
            writer = csv.DictWriter(output_file, fieldnames=DATABASE_FIELDS)
            writer.writeheader()
            writer.writerows(rows)
    else:
        raise ValueError("--output file extension must be .json or .csv")


def upload_forecasts(rows: list[dict[str, Any]]) -> None:
    """Upsert forecasts using the laptop-only SUPABASE_SERVICE_ROLE_KEY."""
    base_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not service_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the process environment; "
            "use --dry-run or --output if the database is unavailable"
        )
    endpoint = f"{base_url}/rest/v1/forecasts?{urlencode({'on_conflict': 'forecast_date,product_id'})}"
    payload = json.dumps(rows, separators=(",", ":")).encode("utf-8")
    request = Request(
        endpoint,
        data=payload,
        method="POST",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    try:
        with urlopen(request, timeout=20) as response:
            if response.status not in (200, 201, 204):
                raise RuntimeError(f"Supabase forecast upsert returned HTTP {response.status}")
    except HTTPError as error:
        raise RuntimeError(
            f"Supabase forecast upsert failed with HTTP {error.code}; use --output <file.json|file.csv> as fallback"
        ) from None
    except URLError as error:
        raise RuntimeError(
            f"Supabase forecast service is unavailable ({error.reason}); use --output <file.json|file.csv> as fallback"
        ) from None
    except TimeoutError:
        raise RuntimeError(
            "Supabase forecast upload timed out; use --output <file.json|file.csv> as fallback"
        ) from None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Train and forecast SIMULATED per-product demand (units arriving/day)."
    )
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="non-secret demo product JSON config")
    parser.add_argument("--horizon", type=int, default=14, help="forward forecast horizon in days (default: 14)")
    parser.add_argument(
        "--target",
        choices=("units_per_day", "boxes_per_day"),
        default="units_per_day",
        help="training target scale; rows are always written in units/day",
    )
    parser.add_argument("--evaluate", action="store_true", help="also evaluate the last 90 historical synthetic days")
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--dry-run", action="store_true", help="print labeled forecast rows; do not write to Supabase")
    output.add_argument("--output", type=Path, help="write labeled fallback .json or .csv instead of Supabase")
    return parser


def main(argv: list[str] | None = None) -> int:
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = build_parser()
    args = parser.parse_args(argv)
    started = time.perf_counter()
    try:
        config = load_config(args.config)
        if args.evaluate:
            for result in evaluate_history(config, target=args.target):
                logging.info(
                    "Historical synthetic evaluation %s: MAE=%.3f RMSE=%.3f coverage=%.1f%%",
                    result["product"],
                    result["mae"],
                    result["rmse"],
                    float(result["coverage"]) * 100,
                )

        rows = generate_forecast_rows(config, horizon=args.horizon, target=args.target)
        document = output_document(config, rows, args.target)
        if args.dry_run:
            print(json.dumps(document, indent=2))
            logging.info("DRY RUN: printed %d synthetic forecast rows; nothing was uploaded", len(rows))
        elif args.output:
            write_output(args.output, document)
            logging.info("Wrote %d labeled synthetic forecast rows to %s", len(rows), args.output)
        else:
            upload_forecasts(rows)
            logging.info("Upserted %d synthetic forecast rows to Supabase", len(rows))
        return 0
    except Exception as error:
        logging.error("Forecast run failed: %s", error)
        return 1
    finally:
        logging.info("Full run runtime: %.2f seconds", time.perf_counter() - started)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    raise SystemExit(main())
