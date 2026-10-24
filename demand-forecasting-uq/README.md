# Demand Forecasting with Uncertainty Quantification

## What it does
This forecaster generates a separate **synthetic/simulated** daily demand series for each of the four seeded demo products, fits LightGBM quantile models (p10, p50, p90), and forecasts expected units arriving per day. It does not use real sales or arrival data. Keep the synthetic label visible in any downstream UI.

The model family and feature set remain LightGBM quantile regression with calendar fields, lags 7/14/28, and 7-day rolling mean and standard deviation. `--evaluate` optionally evaluates the last 90 synthetic history days with MAE, RMSE, and interval coverage.

## Product and demand configuration
`products.json` is non-secret configuration mirroring `supabase/seed.sql` (IDs, names, categories, weights, and shelf life). It also labels the data synthetic and sets each product's synthetic baseline demand:

| Product | Base units/day | 40-unit batch at baseline |
|---|---:|---:|
| Chips | 12 | 3.3 days |
| Green Tea | 8 | 5.0 days |
| Pasta | 14 | 2.9 days |
| Coffee | 18 | 2.2 days |

This scale follows D3: one box contains 40 units and baseline p50 demand sells it in about 2–6 days. The series include mild trend, calendar seasonality, noise, and occasional spikes; every generated value remains synthetic.

## Install
The working environment used Python 3.14.5. Dependencies were installed and tested in the supplied virtual environment. `requirements.txt` records its `pip freeze` output, including resolved transitive versions.

```sh
# Activate your virtual environment, then:
python -m pip install -r requirements.txt
```

`main.py` imports only NumPy, pandas, and LightGBM directly. It automatically loads `.env` from the repository root if present, while process environment variables set in the terminal always take priority.

## Run
A 14-day forward forecast is the default. Forecast dates begin today and include today plus the next 13 days.

```sh
# Safe: trains all product models and prints all rows, without database writes.
python main.py --dry-run

# Change the horizon or the model's training target scale.
python main.py --dry-run --horizon 7
python main.py --dry-run --target boxes_per_day

# Optional historical evaluation, followed by the forward forecast.
python main.py --dry-run --evaluate
```

The JSON dry-run output includes a `data_label` identifying the values as synthetic/simulated. Each forecast row has `forecast_date`, `product_id`, `p10`, `p50`, `p90`, and `generated_at`. The rows are always expressed as **units per day**; `boxes_per_day` trains in boxes and converts the results back to units using 40 units per box. Quantiles are clamped to nonnegative values and ordered so `p10 <= p50 <= p90`.

## Supabase loader
A normal run (no `--dry-run` or `--output`) upserts all forecast rows into `public.forecasts` through the Supabase REST API using the unique `(forecast_date, product_id)` key. It requires `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) in the process environment or repository `.env`. The secret key is for this laptop-side loader only; never put it in the web app or ESP32. Before uploading, the forecaster verifies up front that all product IDs exist in the database, producing a clear setup message instead of an opaque foreign-key error if products have not yet been seeded.

```sh
# Set these variables securely in the terminal environment, not in source code.
# Then run:
python main.py --horizon 14
```

If the database is unavailable, write a labeled fallback file instead:

```sh
python main.py --output forecasts.json
python main.py --output forecasts.csv
```

JSON output includes a top-level synthetic-data label. CSV starts with a `# SYNTHETIC / SIMULATED` comment line. A failed upload logs an error and suggests file output; it does not silently fall back or hide the failure.

## Tests and runtime
Run the unit tests with the same interpreter used for the forecaster:

```sh
python -m unittest discover -s tests -v
```

The tests check that product configuration matches the Supabase seed, each product gets every date in the horizon, quantiles are ordered/nonnegative, and D3's 40-unit sell-through scale is met.

Measured full default dry run on Python 3.14.5 (numpy 2.5.4, pandas 3.1.0, LightGBM 4.7.0): **0.55 seconds** for 4 products × 14 days, training three quantile models per product. This measures local synthetic generation/training/output only, not a Supabase network upload.
