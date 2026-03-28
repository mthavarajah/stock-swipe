"""Run schema.sql and apply any new column migrations against Snowflake.

Usage (from backend/ directory):
    python -m db.setup
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from db.snowflake import get_conn

load_dotenv()

# New columns added in the enrichment pass — safe to run repeatedly
NEW_COLUMNS = [
    ("description",      "VARCHAR(500)"),
    ("day_low",          "FLOAT"),
    ("day_high",         "FLOAT"),
    ("week_52_low",      "FLOAT"),
    ("week_52_high",     "FLOAT"),
    ("volume",           "FLOAT"),
    ("avg_volume",       "FLOAT"),
    ("market_beta",      "FLOAT"),
    ("eps",              "FLOAT"),
    ("forward_dividend", "FLOAT"),
    ("ex_dividend_date", "VARCHAR(20)"),
    ("analyst_target",   "FLOAT"),
    ("earnings_date",    "VARCHAR(20)"),
    ("float_shares",     "FLOAT"),
    ("short_ratio",      "FLOAT"),
    ("day_change_pct",   "FLOAT"),
]


def run():
    sql = Path(__file__).parent.joinpath("schema.sql").read_text()
    statements = [s.strip() for s in sql.split(";") if s.strip()]

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Create tables
            for stmt in statements:
                print(f"Running: {stmt[:60].strip()}...")
                cur.execute(stmt)
                print("  OK")

            # Migrate new columns onto existing STOCKS table
            for col, col_type in NEW_COLUMNS:
                try:
                    cur.execute(f"ALTER TABLE STOCKS ADD COLUMN IF NOT EXISTS {col} {col_type}")
                    print(f"  + STOCKS.{col} ({col_type})")
                except Exception as e:
                    print(f"  ! STOCKS.{col}: {e}")

    print("\nSchema ready.")


if __name__ == "__main__":
    run()
