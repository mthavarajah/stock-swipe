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

PERIOD_MAP = {
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
    Fetch live OHLCV for a ticker and UI period label.
    Uses Ticker.history() to avoid MultiIndex issues with yf.download().
    Returns the response dict or None on failure.
    """
    params = PERIOD_MAP.get(ui_period, PERIOD_MAP["1M"])
    try:
        t = yf.Ticker(ticker)
        hist = t.history(
            period=params["period"],
            interval=params["interval"],
            auto_adjust=True,
        )
        if hist is None or hist.empty:
            return None

        # Ticker.history() always returns flat columns — no MultiIndex
        hist.columns = [str(c).lower() for c in hist.columns]

        rows = []
        for ts, row in hist.iterrows():
            date_str = ts.strftime("%Y-%m-%dT%H:%M:%SZ") if hasattr(ts, "strftime") else str(ts)
            rows.append({
                "date":   date_str,
                "close":  _safe_float(row.get("close")),
                "open":   _safe_float(row.get("open")),
                "high":   _safe_float(row.get("high")),
                "low":    _safe_float(row.get("low")),
                "volume": _safe_float(row.get("volume")),
            })

        rows = [r for r in rows if r["close"] is not None]

        if len(rows) < 2:
            return None

        first_close = rows[0]["close"] or 0
        last_close  = rows[-1]["close"] or 0
        change_abs  = last_close - first_close
        change_pct  = (change_abs / first_close * 100) if first_close else 0.0

        return {
            "ticker":     ticker,
            "period":     ui_period,
            "change_pct": round(change_pct, 2),
            "change_abs": round(change_abs, 2),
            "data":       rows,
        }
    except Exception:
        import traceback
        traceback.print_exc()
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
    Full live quote for a ticker via yfinance t.info.
    Returns all metrics shown on the card. Cached 5 min on the backend.
    """
    try:
        t    = yf.Ticker(ticker)
        info = t.info or {}

        # Price & day change
        price      = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
        prev_close = _safe_float(info.get("previousClose") or info.get("regularMarketPreviousClose"))
        day_change_pct = None
        if price is not None and prev_close:
            day_change_pct = round((price - prev_close) / prev_close * 100, 2)

        # Dividend yield as a percentage
        dy = info.get("dividendYield")
        dividend_yield = float(dy) if dy else None

        # Upcoming earnings date only (must be in the future)
        earnings_date = None
        try:
            cal = t.calendar
            if isinstance(cal, dict):
                ed_list = cal.get("Earnings Date", [])
                today = datetime.utcnow().date()
                for ed in ed_list:
                    try:
                        d = ed if hasattr(ed, "year") else pd.to_datetime(ed).date()
                        if d >= today:
                            earnings_date = d.strftime("%b %d, %Y")
                            break
                    except Exception:
                        pass
        except Exception:
            pass

        desc = info.get("longBusinessSummary", "") or ""

        return {
            "ticker":          ticker,
            # Price
            "price":           price,
            "day_change_pct":  day_change_pct,
            # Ranges
            "day_low":         _safe_float(info.get("dayLow")),
            "day_high":        _safe_float(info.get("dayHigh")),
            "week_52_low":     _safe_float(info.get("fiftyTwoWeekLow")),
            "week_52_high":    _safe_float(info.get("fiftyTwoWeekHigh")),
            # Volume
            "volume":          _safe_float(info.get("volume") or info.get("regularMarketVolume")),
            "avg_volume":      _safe_float(info.get("averageVolume")),
            # Fundamentals
            "market_cap":      _safe_float(info.get("marketCap")),
            "pe_ratio":        _safe_float(info.get("trailingPE") or info.get("forwardPE")),
            "eps":             _safe_float(info.get("trailingEps")),
            "market_beta":     _safe_float(info.get("beta")),
            "dividend_yield":  dividend_yield,
            "forward_dividend":_safe_float(info.get("dividendRate")),
            "earnings_date":   earnings_date,
            # Description
            "description":     desc[:600] if desc else None,
        }
    except Exception:
        import traceback; traceback.print_exc()
        return None


def fetch_news_articles(ticker: str, _company_name: str = "", _news_api_key: str = "") -> list[dict]:
    """
    Fetch top 4 news articles for a ticker via yfinance.
    Returns list of {title, source, url, published_at, sentiment} dicts.
    """
    try:
        t    = yf.Ticker(ticker)
        raw  = t.news or []
        result = []
        for item in raw:
            # yfinance 0.2.x nests content inside item['content']
            content = item.get("content") or item
            title = (content.get("title") or "").strip()
            if not title:
                continue

            # URL: prefer canonicalUrl, fall back to clickThroughUrl or link
            url = (
                (content.get("canonicalUrl") or {}).get("url")
                or (content.get("clickThroughUrl") or {}).get("url")
                or content.get("link", "")
            )
            source = (
                (content.get("provider") or {}).get("displayName")
                or content.get("publisher", "")
            )
            pub_date = content.get("pubDate") or content.get("providerPublishTime")

            result.append({
                "title":        title[:140],
                "source":       source,
                "url":          url,
                "published_at": pub_date,
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
