"""
Orchestrator — seed the Snowflake STOCKS table.

Usage:
    cd backend
    python -m data.pipeline

Steps:
  1. Load environment variables from .env
  2. Fetch all S&P 500 tickers from Wikipedia
  3. For each ticker: fetch raw data (yfinance + NewsAPI)
  4. Engineer & normalise 6-dim feature vectors
  5. Upsert all stocks into Snowflake
  6. Log final count
"""

import logging
import os
import sys
import time

from dotenv import load_dotenv
from tqdm import tqdm

# Adjust path so we can import sibling packages when run as a module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from data.fetch import fetch_stock_raw
from data.features import compute_vectors
from db.snowflake import upsert_stock

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Config                                                                       #
# --------------------------------------------------------------------------- #

SLEEP_BETWEEN_TICKERS = 0.5   # seconds — avoids yfinance rate limits
BATCH_UPSERT_LOG_EVERY = 10

# Top 50 US-listed stocks by market cap — curated for demo diversity
TOP_100_TICKERS = [
    "NVDA", "AAPL", "GOOG", "MSFT", "AMZN",
    "META", "AVGO", "TSM",  "TSLA", "BRK-B",
    "JPM",  "V",    "LLY",  "WMT",  "MA",
    "ORCL", "NFLX", "XOM",  "COST", "SAP",
    "PG",   "HD",   "UNH",  "KO",   "ASML",
    "TM",   "NVO",  "CRM",  "ABBV", "CSCO",
    "TMUS", "ADBE", "BAC",  "PDD",  "MCD",
    "LIN",  "PM",   "AZN",  "TMO",  "DIS",
    "NVS",  "SHOP", "ACN",  "TXN",  "AMD",
    "CMCSA","WFC",  "BABA", "INTU", "DHR",
    "QCOM", "NEE",  "IBM",  "GE",   "PEP",
    "SHEL", "BMY",  "AMGN", "HON",  "RTX",
    "UL",   "MS",   "T",    "CVX",  "SNY",
    "NOW",  "BKNG", "SBUX", "LMT",  "LOW",
    "PYPL", "CAT",  "GS",   "INTC", "ISRG",
    "UNP",  "TTE",  "SPGI", "PLD",  "COP",
    "DE",   "UBER", "BA",   "MDT",  "ADP",
    "CB",   "MU",   "VRTX", "GILD", "C",
    "AMAT", "MDLZ", "AXP",  "ETN",  "TGT",
    "MMC",  "TJX",  "KLAC", "PGR",  "AXP",   # last slot kept; AXP deduped below
]
# Deduplicate while preserving order
_seen = set()
TOP_100_TICKERS = [t for t in TOP_100_TICKERS if not (_seen.add(t) or t in _seen)]


# --------------------------------------------------------------------------- #
# Main                                                                         #
# --------------------------------------------------------------------------- #

def run() -> None:
    load_dotenv()

    news_api_key = os.environ.get("NEWS_API_KEY", "")
    if not news_api_key:
        log.warning("NEWS_API_KEY not set — sentiment scores will be None")

    # 1. Tickers
    tickers = TOP_100_TICKERS
    log.info("Using %d curated top-market-cap tickers", len(tickers))

    # 2. Raw data
    raw_stocks: list[dict] = []
    skipped: list[str] = []

    log.info("Fetching raw data (yfinance + NewsAPI) …")
    for ticker in tqdm(tickers, desc="Fetching", unit="stock"):
        raw = fetch_stock_raw(ticker, news_api_key, sleep_seconds=SLEEP_BETWEEN_TICKERS)
        if raw is None:
            skipped.append(ticker)
        else:
            raw_stocks.append(raw)

    log.info(
        "Raw fetch complete: %d succeeded, %d skipped (%s)",
        len(raw_stocks),
        len(skipped),
        ", ".join(skipped[:10]) + ("…" if len(skipped) > 10 else ""),
    )

    if not raw_stocks:
        log.error("No stock data retrieved — aborting.")
        sys.exit(1)

    # 3 & 4. Feature engineering + normalisation
    log.info("Engineering and normalising feature vectors …")
    stocks_with_vectors = compute_vectors(raw_stocks)
    log.info("Vectors computed for %d stocks", len(stocks_with_vectors))

    # 5. Upsert into Snowflake
    log.info("Loading into Snowflake …")
    loaded = 0
    errors = 0

    for stock in tqdm(stocks_with_vectors, desc="Upserting", unit="stock"):
        try:
            upsert_stock(stock)
            loaded += 1
            if loaded % BATCH_UPSERT_LOG_EVERY == 0:
                log.info("  … %d / %d upserted", loaded, len(stocks_with_vectors))
        except Exception as exc:
            log.warning("Failed to upsert %s: %s", stock.get("ticker"), exc)
            errors += 1

    # 6. Summary
    log.info("=" * 60)
    log.info("Loaded %d stocks into Snowflake (%d errors).", loaded, errors)
    log.info("=" * 60)


if __name__ == "__main__":
    run()
