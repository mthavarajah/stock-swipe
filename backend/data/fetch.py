"""Fetch raw data for S&P 500 stocks from yfinance and NewsAPI."""

import os
import time
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import requests
import yfinance as yf
from textblob import TextBlob

# --------------------------------------------------------------------------- #
# Alpaca market data (works from all cloud IPs unlike yfinance)                #
# --------------------------------------------------------------------------- #

_ALPACA_KEY    = os.getenv("APCA_API_KEY_ID", "")
_ALPACA_SECRET = os.getenv("APCA_API_SECRET_KEY", "")
_ALPACA_BASE   = "https://data.alpaca.markets/v2/stocks"

def _alpaca(path: str, **params) -> dict | None:
    """Call Alpaca Data API v2. Returns parsed JSON or None on any failure."""
    if not _ALPACA_KEY or not _ALPACA_SECRET:
        return None
    try:
        r = requests.get(
            f"{_ALPACA_BASE}/{path}",
            params={"feed": "iex", **params},
            headers={
                "APCA-API-KEY-ID":     _ALPACA_KEY,
                "APCA-API-SECRET-KEY": _ALPACA_SECRET,
            },
            timeout=10,
        )
        if r.status_code in (422, 404):   # symbol not supported on IEX
            return None
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


# --------------------------------------------------------------------------- #
# Tickers                                                                      #
# --------------------------------------------------------------------------- #

def get_sp500_tickers() -> list[str]:
    """Scrape S&P 500 tickers from Wikipedia using BeautifulSoup."""
    from bs4 import BeautifulSoup
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    headers = {"User-Agent": "Mozilla/5.0 (compatible; stock-swipe-bot/1.0)"}
    html = requests.get(url, headers=headers, timeout=15).text
    soup = BeautifulSoup(html, "lxml")
    table = soup.find("table", {"id": "constituents"})
    tickers = []
    for row in table.tbody.find_all("tr"):
        cols = row.find_all("td")
        if cols:
            symbol = cols[0].get_text(strip=True).replace(".", "-")
            tickers.append(symbol)
    return tickers


# --------------------------------------------------------------------------- #
# Price history (pipeline)                                                     #
# --------------------------------------------------------------------------- #

def fetch_price_history(ticker: str) -> pd.DataFrame | None:
    """Return 1 year of daily OHLCV for a ticker, or None on failure."""
    try:
        hist = yf.download(ticker, period="1y", interval="1d", progress=False, auto_adjust=True)
        if hist.empty:
            return None
        return hist
    except Exception:
        return None


# --------------------------------------------------------------------------- #
# Live price history (API endpoint)                                            #
# --------------------------------------------------------------------------- #

# Alpaca timeframe + lookback per UI period
def _alpaca_period_params(ui_period: str) -> dict:
    now   = datetime.utcnow()
    start = {
        "1D":  now - timedelta(days=2),
        "5D":  now - timedelta(days=7),
        "1M":  now - timedelta(days=32),
        "6M":  now - timedelta(days=185),
        "YTD": datetime(now.year, 1, 1),
        "1Y":  now - timedelta(days=370),
        "5Y":  now - timedelta(days=365 * 5 + 2),
        "All": datetime(2010, 1, 1),
    }.get(ui_period, now - timedelta(days=32))
    tf = {
        "1D": "5Min", "5D": "1Hour",
        "1M": "1Day", "6M": "1Day",  "YTD": "1Day",
        "1Y": "1Week", "5Y": "1Month", "All": "1Month",
    }.get(ui_period, "1Day")
    return {"timeframe": tf, "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"), "limit": 500, "sort": "asc"}

# yfinance fallback config (local dev)
_YF_PERIOD = {
    "1D":  {"period": "1d",  "interval": "5m"},
    "5D":  {"period": "5d",  "interval": "15m"},
    "1M":  {"period": "1mo", "interval": "1d"},
    "6M":  {"period": "6mo", "interval": "1d"},
    "YTD": {"period": "ytd", "interval": "1d"},
    "1Y":  {"period": "1y",  "interval": "1wk"},
    "5Y":  {"period": "5y",  "interval": "1mo"},
    "All": {"period": "max", "interval": "3mo"},
}


def fetch_ohlcv(ticker: str, ui_period: str) -> dict | None:
    """
    Fetch live OHLCV. Tries Alpaca first (reliable from cloud IPs),
    falls back to yfinance for local dev.
    """
    # ── Alpaca (primary on Render) ───────────────────────────────────────────
    params = _alpaca_period_params(ui_period)
    data   = _alpaca(f"{ticker}/bars", **params)
    if data and data.get("bars"):
        rows = []
        for bar in data["bars"]:
            close = _safe_float(bar.get("c"))
            if close is None:
                continue
            rows.append({
                "date":   bar["t"],
                "close":  round(close, 4),
                "open":   round(_safe_float(bar.get("o")) or close, 4),
                "high":   round(_safe_float(bar.get("h")) or close, 4),
                "low":    round(_safe_float(bar.get("l")) or close, 4),
                "volume": int(bar["v"]) if bar.get("v") else None,
            })
        if len(rows) >= 2:
            first, last = rows[0]["close"], rows[-1]["close"]
            return {
                "ticker":     ticker,
                "period":     ui_period,
                "change_pct": round((last - first) / first * 100, 2) if first else 0.0,
                "change_abs": round(last - first, 2),
                "data":       rows,
            }

    # ── yfinance fallback (local dev) ────────────────────────────────────────
    yf_cfg = _YF_PERIOD.get(ui_period, _YF_PERIOD["1M"])
    try:
        t    = yf.Ticker(ticker)
        hist = t.history(period=yf_cfg["period"], interval=yf_cfg["interval"], auto_adjust=True)
        if hist is None or hist.empty:
            return None
        hist.columns = [str(c).lower() for c in hist.columns]
        rows = []
        for ts, row in hist.iterrows():
            date_str = ts.strftime("%Y-%m-%dT%H:%M:%SZ") if hasattr(ts, "strftime") else str(ts)
            close = _safe_float(row.get("close"))
            if close is None:
                continue
            rows.append({
                "date":   date_str,
                "close":  close,
                "open":   _safe_float(row.get("open")),
                "high":   _safe_float(row.get("high")),
                "low":    _safe_float(row.get("low")),
                "volume": _safe_float(row.get("volume")),
            })
        if len(rows) < 2:
            return None
        first, last = rows[0]["close"] or 0, rows[-1]["close"] or 0
        return {
            "ticker":     ticker,
            "period":     ui_period,
            "change_pct": round((last - first) / first * 100, 2) if first else 0.0,
            "change_abs": round(last - first, 2),
            "data":       rows,
        }
    except Exception:
        return None


# --------------------------------------------------------------------------- #
# Info + ESG                                                                   #
# --------------------------------------------------------------------------- #

def _safe_float(v) -> float | None:
    try:
        f = float(v)
        return None if (f != f) else f   # NaN check
    except (TypeError, ValueError):
        return None


def _ts_to_date(ts) -> str | None:
    """Convert Unix timestamp to 'Mon DD, YYYY' string."""
    if ts is None:
        return None
    try:
        return datetime.utcfromtimestamp(int(ts)).strftime("%b %d, %Y")
    except Exception:
        return None


def fetch_ticker_info(ticker: str) -> dict:
    """Return enriched dict including all new fields."""
    result: dict = {
        "name": ticker,
        "sector": None,
        "market_cap": None,
        "pe_ratio": None,
        "dividend_yield": None,
        "esg_score": None,
        # new fields
        "description": None,
        "day_low": None,
        "day_high": None,
        "week_52_low": None,
        "week_52_high": None,
        "volume": None,
        "avg_volume": None,
        "market_beta": None,
        "eps": None,
        "forward_dividend": None,
        "ex_dividend_date": None,
        "analyst_target": None,
        "earnings_date": None,
        "float_shares": None,
        "short_ratio": None,
        "day_change_pct": None,
    }
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        result["name"]      = info.get("longName") or info.get("shortName") or ticker
        result["sector"]    = info.get("sector")
        result["market_cap"] = info.get("marketCap")
        result["pe_ratio"]  = info.get("trailingPE") or info.get("forwardPE")
        dy = info.get("dividendYield")
        result["dividend_yield"] = float(dy) if dy else None

        # Description
        desc = info.get("longBusinessSummary", "") or ""
        result["description"] = desc[:500] if desc else None

        # Price ranges
        result["day_low"]      = _safe_float(info.get("dayLow"))
        result["day_high"]     = _safe_float(info.get("dayHigh"))
        result["week_52_low"]  = _safe_float(info.get("fiftyTwoWeekLow"))
        result["week_52_high"] = _safe_float(info.get("fiftyTwoWeekHigh"))

        # Volume
        result["volume"]     = _safe_float(info.get("volume"))
        result["avg_volume"] = _safe_float(info.get("averageVolume"))

        # Fundamentals
        result["market_beta"]      = _safe_float(info.get("beta"))
        result["eps"]              = _safe_float(info.get("trailingEps"))
        result["forward_dividend"] = _safe_float(info.get("dividendRate"))
        result["analyst_target"]   = _safe_float(info.get("targetMeanPrice"))
        result["float_shares"]     = _safe_float(info.get("floatShares"))
        result["short_ratio"]      = _safe_float(info.get("shortRatio"))

        # Dates
        result["ex_dividend_date"] = _ts_to_date(info.get("exDividendDate"))
        result["earnings_date"]    = _ts_to_date(info.get("mostRecentQuarter"))

        # Day change
        chg = info.get("regularMarketChangePercent")
        result["day_change_pct"] = _safe_float(chg)

        # ESG
        try:
            sus = t.sustainability
            if sus is not None and not sus.empty:
                esg_val = sus.loc["totalEsg", "Value"] if "totalEsg" in sus.index else None
                if esg_val is not None and not (isinstance(esg_val, float) and np.isnan(esg_val)):
                    result["esg_score"] = float(esg_val)
        except Exception:
            pass

    except Exception:
        pass

    return result


# --------------------------------------------------------------------------- #
# Sentiment                                                                     #
# --------------------------------------------------------------------------- #

def fetch_sentiment(ticker: str, news_api_key: str) -> float | None:
    """Average TextBlob polarity of recent headlines via NewsAPI."""
    if not news_api_key:
        return None
    to_date   = datetime.utcnow().date()
    from_date = to_date - timedelta(days=7)
    url = "https://newsapi.org/v2/everything"
    params = {
        "q": ticker, "from": str(from_date), "to": str(to_date),
        "language": "en", "pageSize": 20, "sortBy": "relevancy",
        "apiKey": news_api_key,
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        articles = resp.json().get("articles", [])
        if not articles:
            return None
        polarities = [
            TextBlob(a.get("title") or "").sentiment.polarity
            for a in articles if a.get("title")
        ]
        return float(np.mean(polarities)) if polarities else None
    except Exception:
        return None


def fetch_live_quote(ticker: str) -> dict | None:
    """
    Live quote. Tries Alpaca snapshot first, falls back to yfinance for local dev.
    """
    # ── Alpaca snapshot (primary on Render) ─────────────────────────────────
    snap = _alpaca(f"{ticker}/snapshot")
    if snap:
        daily  = snap.get("dailyBar")    or {}
        prev   = snap.get("prevDailyBar") or {}
        trade  = snap.get("latestTrade")  or {}
        price  = _safe_float(trade.get("p")) or _safe_float(daily.get("c"))
        prev_c = _safe_float(prev.get("c"))
        pct    = round((price - prev_c) / prev_c * 100, 2) if price and prev_c else None
        return {
            "ticker":          ticker,
            "price":           price,
            "day_change_pct":  pct,
            "day_low":         _safe_float(daily.get("l")),
            "day_high":        _safe_float(daily.get("h")),
            "week_52_low":     None,   # not in snapshot — falls back to Snowflake
            "week_52_high":    None,
            "volume":          _safe_float(daily.get("v")),
            "avg_volume":      None,
            "market_cap":      None,
            "pe_ratio":        None,
            "eps":             None,
            "market_beta":     None,
            "dividend_yield":  None,
            "forward_dividend": None,
            "earnings_date":   None,
            "description":     None,
        }

    # ── yfinance fallback (local dev) ────────────────────────────────────────
    try:
        t    = yf.Ticker(ticker)
        info = t.info or {}
        price      = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
        prev_close = _safe_float(info.get("previousClose") or info.get("regularMarketPreviousClose"))
        day_change_pct = None
        if price is not None and prev_close:
            day_change_pct = round((price - prev_close) / prev_close * 100, 2)
        dy   = info.get("dividendYield")
        desc = (info.get("longBusinessSummary") or "")[:600] or None
        earnings_date = None
        try:
            cal = t.calendar
            if isinstance(cal, dict):
                today = datetime.utcnow().date()
                for ed in cal.get("Earnings Date", []):
                    d = ed if hasattr(ed, "year") else pd.to_datetime(ed).date()
                    if d >= today:
                        earnings_date = d.strftime("%b %d, %Y")
                        break
        except Exception:
            pass
        return {
            "ticker":          ticker,
            "price":           price,
            "day_change_pct":  day_change_pct,
            "day_low":         _safe_float(info.get("dayLow")),
            "day_high":        _safe_float(info.get("dayHigh")),
            "week_52_low":     _safe_float(info.get("fiftyTwoWeekLow")),
            "week_52_high":    _safe_float(info.get("fiftyTwoWeekHigh")),
            "volume":          _safe_float(info.get("volume") or info.get("regularMarketVolume")),
            "avg_volume":      _safe_float(info.get("averageVolume")),
            "market_cap":      _safe_float(info.get("marketCap")),
            "pe_ratio":        _safe_float(info.get("trailingPE") or info.get("forwardPE")),
            "eps":             _safe_float(info.get("trailingEps")),
            "market_beta":     _safe_float(info.get("beta")),
            "dividend_yield":  float(dy) if dy else None,
            "forward_dividend": _safe_float(info.get("dividendRate")),
            "earnings_date":   earnings_date,
            "description":     desc,
        }
    except Exception:
        return None


def fetch_news_articles(ticker: str, _company_name: str = "", _news_api_key: str = "") -> list[dict]:
    """
    Fetch up to 4 news articles via Google News RSS — no API key, no IP restrictions.
    Same source used by the Vercel serverless function in production.
    """
    import xml.etree.ElementTree as ET
    query = requests.utils.quote(ticker + " stock")
    url   = f"https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"
    try:
        r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        r.raise_for_status()
        root   = ET.fromstring(r.text)
        result = []
        for item in root.findall(".//item"):
            title   = (item.findtext("title") or "").strip()
            link    = item.findtext("link") or ""
            pubdate = item.findtext("pubDate") or ""
            src_el  = item.find("source")
            source  = src_el.text if src_el is not None else "Google News"
            if not title:
                continue
            result.append({
                "title":        title[:140],
                "source":       source,
                "url":          link,
                "published_at": pubdate,
                "sentiment":    round(TextBlob(title).sentiment.polarity, 3),
            })
            if len(result) == 4:
                break
        return result
    except Exception:
        return []


# --------------------------------------------------------------------------- #
# Main fetch function (used by pipeline.py)                                    #
# --------------------------------------------------------------------------- #

def fetch_stock_raw(
    ticker: str,
    news_api_key: str,
    sleep_seconds: float = 0.5,
) -> dict | None:
    """Fetch all raw data for a single ticker. Returns None if price unavailable."""
    hist = fetch_price_history(ticker)
    if hist is None:
        return None

    info = fetch_ticker_info(ticker)
    time.sleep(sleep_seconds)

    sentiment = fetch_sentiment(ticker, news_api_key)

    close = hist["Close"]
    if hasattr(close, "iloc"):
        close = close.squeeze()

    prices = close.dropna()
    price_now = float(prices.iloc[-1]) if len(prices) >= 1 else None

    momentum_30d = None
    if len(prices) >= 30:
        p30 = float(prices.iloc[-30])
        if p30:
            momentum_30d = (float(prices.iloc[-1]) - p30) / p30

    momentum_90d = None
    if len(prices) >= 90:
        p90 = float(prices.iloc[-90])
        if p90:
            momentum_90d = (float(prices.iloc[-1]) - p90) / p90

    volatility_30d = None
    if len(prices) >= 31:
        daily_returns = prices.pct_change().dropna()
        if len(daily_returns) >= 30:
            volatility_30d = float(daily_returns.iloc[-30:].std())

    return {
        "ticker":           ticker,
        "name":             info["name"],
        "sector":           info["sector"],
        "price":            price_now,
        "market_cap":       info["market_cap"],
        "pe_ratio":         info["pe_ratio"],
        "dividend_yield":   info["dividend_yield"],
        "momentum_30d":     momentum_30d,
        "momentum_90d":     momentum_90d,
        "volatility_30d":   volatility_30d,
        "esg_score":        info["esg_score"],
        "sentiment_score":  sentiment,
        # new fields
        "description":       info["description"],
        "day_low":           info["day_low"],
        "day_high":          info["day_high"],
        "week_52_low":       info["week_52_low"],
        "week_52_high":      info["week_52_high"],
        "volume":            info["volume"],
        "avg_volume":        info["avg_volume"],
        "market_beta":       info["market_beta"],
        "eps":               info["eps"],
        "forward_dividend":  info["forward_dividend"],
        "ex_dividend_date":  info["ex_dividend_date"],
        "analyst_target":    info["analyst_target"],
        "earnings_date":     info["earnings_date"],
        "float_shares":      info["float_shares"],
        "short_ratio":       info["short_ratio"],
        "day_change_pct":    info["day_change_pct"],
    }
