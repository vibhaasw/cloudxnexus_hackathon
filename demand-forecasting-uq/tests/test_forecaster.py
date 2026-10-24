import re
import unittest
from datetime import date
from pathlib import Path

from forecaster import generate_forecast_rows, load_config


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = Path(__file__).resolve().parents[1] / "products.json"
SEED_PATH = PROJECT_ROOT / "supabase" / "seed.sql"


class ForecasterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = load_config(CONFIG_PATH)
        cls.forecast_start = date.today()
        cls.rows = generate_forecast_rows(
            cls.config,
            horizon=14,
            history_days=365,
            num_boost_round=25,
            forecast_start=cls.forecast_start,
        )

    def test_product_config_matches_supabase_seed_and_box_scale(self):
        seed = SEED_PATH.read_text(encoding="utf-8")
        pattern = re.compile(
            r"\('([0-9a-f-]+)', '([^']+)', '([^']+)', ([0-9.]+), (\d+)\)"
        )
        seeded = [
            (product_id, name, category, float(weight), int(shelf_life))
            for product_id, name, category, weight, shelf_life in pattern.findall(seed)
        ]
        configured = [
            (
                product["product_id"],
                product["name"],
                product["category"],
                float(product["weight_kg"]),
                int(product["shelf_life_days"]),
            )
            for product in self.config["products"]
        ]
        self.assertEqual(configured, seeded)
        self.assertEqual(self.config["units_per_box"], 40)
        self.assertTrue(self.config["synthetic_data"])

    def test_forecast_covers_each_product_on_each_future_day(self):
        products = self.config["products"]
        self.assertEqual(len(self.rows), len(products) * 14)
        expected_ids = {product["product_id"] for product in products}
        self.assertEqual({row["product_id"] for row in self.rows}, expected_ids)
        for product_id in expected_ids:
            product_rows = sorted(
                (row for row in self.rows if row["product_id"] == product_id),
                key=lambda row: row["forecast_date"],
            )
            self.assertEqual(len(product_rows), 14)
            days = [date.fromisoformat(row["forecast_date"]) for row in product_rows]
            self.assertEqual(days[0], self.forecast_start)
            self.assertEqual((days[-1] - days[0]).days, 13)

    def test_quantiles_are_ordered_nonnegative_and_match_d3_scale(self):
        for product in self.config["products"]:
            product_rows = [
                row for row in self.rows if row["product_id"] == product["product_id"]
            ]
            for row in product_rows:
                self.assertGreaterEqual(row["p10"], 0)
                self.assertGreaterEqual(row["p50"], row["p10"])
                self.assertGreaterEqual(row["p90"], row["p50"])
            mean_median_demand = sum(row["p50"] for row in product_rows) / len(product_rows)
            estimated_sell_days = 40 / mean_median_demand
            self.assertGreaterEqual(estimated_sell_days, 2)
            self.assertLessEqual(estimated_sell_days, 6)

    def test_forecast_rows_have_database_fields_and_timestamp(self):
        expected = {
            "forecast_date",
            "product_id",
            "p10",
            "p50",
            "p90",
            "generated_at",
        }
        for row in self.rows:
            self.assertEqual(set(row), expected)
            self.assertTrue(row["generated_at"].endswith("Z"))


if __name__ == "__main__":
    unittest.main()
