"""Stock Swipe — FastAPI backend.

Four endpoints:
  POST /onboard               — quiz answers → create user, return first batch
  POST /swipe                 — record swipe, update user vector + stock bandit params
  GET  /next-batch            — return top 10 unseen stocks scored for this user
  GET  /playlist              — return all right-swiped stocks sorted by taste match
  GET  /stock/{ticker}/history — OHLCV price history (cached 5 min)
  GET  /stock/{ticker}/news   — latest news articles with sentiment

Plus:
  GET  /health                — liveness check for Railway
"""

import json
import time
import uuid
from typing import Any

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from data.fetch import fetch_live_quote, fetch_news_articles, fetch_ohlcv
from db.snowflake import execute, fetch_all, fetch_one, upsert_user
from model.scorer import epsilon, get_next_batch
from model.vectors import (
    cosine_similarity,
    quiz_to_user_vector,
    update_user_vector,
)

load_dotenv()

app = FastAPI(title="Stock Swipe API", version="1.0.0")

# Allow all origins so the Vercel frontend can talk to the Railway backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================================== #
# Pydantic models                                                              #
# =========================================================================== #

class OnboardRequest(BaseModel):
    style: str = Field(
        default="balanced",
        description="Investing style: 'growth', 'value', or 'balanced'",
    )
    esg_priority: int = Field(
        default=3,
        ge=1,
        le=5,
        description="How important is ESG? 1 (not at all) – 5 (very important)",
    )
    risk_tolerance: str = Field(
        default="medium",
        description="Risk appetite: 'low', 'medium', or 'high'",
    )
    time_horizon: str = Field(
        default="long",
        description="Investment horizon: 'short' or 'long'",
    )
    wants_dividend: bool = Field(
        default=False,
        description="Whether the user wants dividend-paying stocks",
    )


class StockObject(BaseModel):
    ticker: str
    name: str | None
    sector: str | None
    price: float | None
    vector: list[float]
    cosine_score: float
    hybrid_score: float
    match_pct: int
    reason: str
    dividend_yield: float | None
    pe_ratio: float | None
    momentum_30d: float | None
    # enriched fields
    market_cap: float | None = None
    volatility_30d: float | None = None
    esg_score: float | None = None
    sentiment_score: float | None = None
    description: str | None = None
    day_low: float | None = None
    day_high: float | None = None
    week_52_low: float | None = None
    week_52_high: float | None = None
    volume: float | None = None
    avg_volume: float | None = None
    market_beta: float | None = None
    eps: float | None = None
    forward_dividend: float | None = None
    ex_dividend_date: str | None = None
    analyst_target: float | None = None
    earnings_date: str | None = None
    float_shares: float | None = None
    short_ratio: float | None = None
    day_change_pct: float | None = None


class OnboardResponse(BaseModel):
    user_id: str
    first_batch: list[StockObject]
    epsilon: float


class SwipeRequest(BaseModel):
    user_id: str
    ticker: str
    direction: str = Field(description="'right' (like) or 'left' (pass)")


class SwipeResponse(BaseModel):
    user_id: str
    swipe_count: int
    epsilon: float
    user_vector: list[float]


class NextBatchResponse(BaseModel):
    user_id: str
    batch: list[StockObject]
    epsilon: float
    swipe_count: int


class PlaylistStock(BaseModel):
    ticker: str
    name: str | None
    sector: str | None
    price: float | None
    vector: list[float]
    cosine_score: float
    match_pct: int
    dividend_yield: float | None
    pe_ratio: float | None
    momentum_30d: float | None
    # enriched fields
    market_cap: float | None = None
    volatility_30d: float | None = None
    esg_score: float | None = None
    sentiment_score: float | None = None
    description: str | None = None
    day_low: float | None = None
    day_high: float | None = None
    week_52_low: float | None = None
    week_52_high: float | None = None
    volume: float | None = None
    avg_volume: float | None = None
    market_beta: float | None = None
    eps: float | None = None
    forward_dividend: float | None = None
    ex_dividend_date: str | None = None
    analyst_target: float | None = None
    earnings_date: str | None = None
    float_shares: float | None = None
    short_ratio: float | None = None
    day_change_pct: float | None = None


class PlaylistResponse(BaseModel):
    user_id: str
    stocks: list[PlaylistStock]


# =========================================================================== #
# Internal helpers                                                             #
# =========================================================================== #

# Maps the quiz style string to a float the vector model understands
_STYLE_MAP = {"growth": 1.0, "balanced": 0.5, "value": 0.0}

# Maps "medium" → "med" to match the vector model's expected keys
_RISK_MAP = {"low": "low", "medium": "med", "high": "high"}


def _quiz_answers_to_model_input(req: OnboardRequest) -> dict:
    """Convert the API request body into the dict quiz_to_user_vector() expects."""
    return {
        "style":     _STYLE_MAP.get(req.style, 0.5),
        "esg":       req.esg_priority,
        "risk":      _RISK_MAP.get(req.risk_tolerance, "med"),
        "horizon":   req.time_horizon,
        "dividends": "yes" if req.wants_dividend else "no",
    }


def _fetch_user(user_id: str) -> dict:
    """Fetch user row from Snowflake. Raises 404 if not found."""
    row = fetch_one(
        "SELECT user_id, user_vector, swipe_count FROM USERS WHERE user_id = %(user_id)s",
        {"user_id": user_id},
    )
    if row is None:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    return row


def _parse_vector(raw: Any) -> np.ndarray:
    """Parse a Snowflake ARRAY column (may be list or JSON string) into numpy."""
    if isinstance(raw, str):
        raw = json.loads(raw)
    return np.asarray(raw, dtype=np.float32)


def _to_stock_object(stock: dict, user_vec: np.ndarray) -> StockObject:
    """Enrich a scored stock dict with match_pct and coerce to StockObject."""
    cos = float(stock.get("cosine_score", 0.0))
    hyb = float(stock.get("hybrid_score", 0.0))
    return StockObject(
        ticker=stock["ticker"],
        name=stock.get("name"),
        sector=stock.get("sector"),
        price=stock.get("price"),
        vector=stock.get("vector", []),
        cosine_score=cos,
        hybrid_score=hyb,
        match_pct=round(((cos + 1.0) / 2.0) * 100),   # [-1,1] → [0,100]
        reason=stock.get("reason", "Matches your investment profile"),
        dividend_yield=stock.get("dividend_yield"),
        pe_ratio=stock.get("pe_ratio"),
        momentum_30d=stock.get("momentum_30d"),
        market_cap=stock.get("market_cap"),
        volatility_30d=stock.get("volatility_30d"),
        esg_score=stock.get("esg_score"),
        sentiment_score=stock.get("sentiment_score"),
        description=stock.get("description"),
        day_low=stock.get("day_low"),
        day_high=stock.get("day_high"),
        week_52_low=stock.get("week_52_low"),
        week_52_high=stock.get("week_52_high"),
        volume=stock.get("volume"),
        avg_volume=stock.get("avg_volume"),
        market_beta=stock.get("market_beta"),
        eps=stock.get("eps"),
        forward_dividend=stock.get("forward_dividend"),
        ex_dividend_date=stock.get("ex_dividend_date"),
        analyst_target=stock.get("analyst_target"),
        earnings_date=stock.get("earnings_date"),
        float_shares=stock.get("float_shares"),
        short_ratio=stock.get("short_ratio"),
        day_change_pct=stock.get("day_change_pct"),
    )


# =========================================================================== #
# Endpoints                                                                    #
# =========================================================================== #

@app.get("/health", tags=["ops"])
def health() -> dict:
    """Liveness check — Railway pings this to confirm the container is up."""
    return {"status": "ok"}


# --------------------------------------------------------------------------- #
# POST /onboard                                                                #
# --------------------------------------------------------------------------- #

@app.post("/onboard", response_model=OnboardResponse, tags=["users"])
def onboard(req: OnboardRequest) -> OnboardResponse:
    """
    Convert quiz answers into a user taste vector, create the user in Snowflake,
    and return the first batch of 10 recommended stocks.
    """
    # 1. Generate user ID
    user_id = str(uuid.uuid4())

    # 2. Build initial preference vector from quiz answers
    answers = _quiz_answers_to_model_input(req)
    user_vec = quiz_to_user_vector(answers)

    # 3. Persist new user to Snowflake
    upsert_user({
        "user_id":     user_id,
        "user_vector": user_vec.tolist(),
        "swipe_count": 0,
    })

    # 4. Score and return first batch
    batch_raw = get_next_batch(user_id, user_vec, swipe_count=0)
    batch = [_to_stock_object(s, user_vec) for s in batch_raw]

    return OnboardResponse(
        user_id=user_id,
        first_batch=batch,
        epsilon=epsilon(0),
    )


# --------------------------------------------------------------------------- #
# POST /swipe                                                                  #
# --------------------------------------------------------------------------- #

@app.post("/swipe", response_model=SwipeResponse, tags=["swipes"])
def swipe(req: SwipeRequest) -> SwipeResponse:
    """
    Record a swipe, update the user's taste vector, and update the stock's
    Thompson Sampling parameters (alpha/beta).
    """
    if req.direction not in ("right", "left"):
        raise HTTPException(status_code=422, detail="direction must be 'right' or 'left'")

    # 1. Fetch current user state
    user_row    = _fetch_user(req.user_id)
    user_vec    = _parse_vector(user_row["user_vector"])
    swipe_count = int(user_row["swipe_count"])

    # 2. Fetch stock vector
    stock_row = fetch_one(
        "SELECT ticker, vector, alpha, beta FROM STOCKS WHERE ticker = %(ticker)s",
        {"ticker": req.ticker},
    )
    if stock_row is None:
        raise HTTPException(status_code=404, detail=f"Stock '{req.ticker}' not found")

    stock_vec = _parse_vector(stock_row["vector"])

    # 3. Update user taste vector
    updated_vec = update_user_vector(user_vec, stock_vec, req.direction)
    new_swipe_count = swipe_count + 1

    # 4. Update stock bandit parameters
    if req.direction == "right":
        execute(
            "UPDATE STOCKS SET alpha = alpha + 1 WHERE ticker = %(ticker)s",
            {"ticker": req.ticker},
        )
    else:
        execute(
            "UPDATE STOCKS SET beta = beta + 1 WHERE ticker = %(ticker)s",
            {"ticker": req.ticker},
        )

    # 5. Insert swipe record
    execute(
        """
        INSERT INTO SWIPES (user_id, ticker, direction)
        VALUES (%(user_id)s, %(ticker)s, %(direction)s)
        """,
        {"user_id": req.user_id, "ticker": req.ticker, "direction": req.direction},
    )

    # 6. Persist updated user state
    upsert_user({
        "user_id":     req.user_id,
        "user_vector": updated_vec.tolist(),
        "swipe_count": new_swipe_count,
    })

    return SwipeResponse(
        user_id=req.user_id,
        swipe_count=new_swipe_count,
        epsilon=epsilon(new_swipe_count),
        user_vector=updated_vec.tolist(),
    )


# --------------------------------------------------------------------------- #
# GET /next-batch                                                              #
# --------------------------------------------------------------------------- #

@app.get("/next-batch", response_model=NextBatchResponse, tags=["recommendations"])
def next_batch(user_id: str = Query(..., description="User UUID")) -> NextBatchResponse:
    """
    Return the next 10 unseen stocks ranked by the hybrid ML score.
    Scores shift from exploration-heavy to taste-heavy as swipe_count grows.
    """
    user_row    = _fetch_user(user_id)
    user_vec    = _parse_vector(user_row["user_vector"])
    swipe_count = int(user_row["swipe_count"])

    batch_raw = get_next_batch(user_id, user_vec, swipe_count)
    batch = [_to_stock_object(s, user_vec) for s in batch_raw]

    return NextBatchResponse(
        user_id=user_id,
        batch=batch,
        epsilon=epsilon(swipe_count),
        swipe_count=swipe_count,
    )


# --------------------------------------------------------------------------- #
# GET /playlist                                                                #
# --------------------------------------------------------------------------- #

@app.get("/playlist", response_model=PlaylistResponse, tags=["recommendations"])
def playlist(user_id: str = Query(..., description="User UUID")) -> PlaylistResponse:
    """
    Return all stocks the user has right-swiped, ordered by cosine similarity
    (highest taste match first).
    """
    user_row = _fetch_user(user_id)
    user_vec = _parse_vector(user_row["user_vector"])

    # Join right-swipes with STOCKS to get full stock data
    liked_stocks = fetch_all(
        """
        SELECT
            s.ticker, s.name, s.sector, s.price, s.vector,
            s.dividend_yield, s.pe_ratio, s.momentum_30d,
            s.market_cap, s.volatility_30d, s.esg_score, s.sentiment_score,
            s.description, s.day_low, s.day_high, s.week_52_low, s.week_52_high,
            s.volume, s.avg_volume, s.market_beta, s.eps, s.forward_dividend,
            s.ex_dividend_date, s.analyst_target, s.earnings_date,
            s.float_shares, s.short_ratio, s.day_change_pct
        FROM STOCKS s
        INNER JOIN SWIPES sw
            ON sw.ticker  = s.ticker
            AND sw.user_id = %(user_id)s
            AND sw.direction = 'right'
        """,
        {"user_id": user_id},
    )

    # Score each liked stock against the current user vector
    scored: list[dict] = []
    for stock in liked_stocks:
        stock_vec = _parse_vector(stock["vector"])
        cos       = cosine_similarity(user_vec, stock_vec)
        scored.append({**stock, "cosine_score": cos, "vector": stock_vec.tolist()})

    scored.sort(key=lambda x: x["cosine_score"], reverse=True)

    result = [
        PlaylistStock(
            ticker=s["ticker"],
            name=s.get("name"),
            sector=s.get("sector"),
            price=s.get("price"),
            vector=s["vector"],
            cosine_score=s["cosine_score"],
            match_pct=round(((s["cosine_score"] + 1.0) / 2.0) * 100),
            dividend_yield=s.get("dividend_yield"),
            pe_ratio=s.get("pe_ratio"),
            momentum_30d=s.get("momentum_30d"),
            market_cap=s.get("market_cap"),
            volatility_30d=s.get("volatility_30d"),
            esg_score=s.get("esg_score"),
            sentiment_score=s.get("sentiment_score"),
            description=s.get("description"),
            day_low=s.get("day_low"),
            day_high=s.get("day_high"),
            week_52_low=s.get("week_52_low"),
            week_52_high=s.get("week_52_high"),
            volume=s.get("volume"),
            avg_volume=s.get("avg_volume"),
            market_beta=s.get("market_beta"),
            eps=s.get("eps"),
            forward_dividend=s.get("forward_dividend"),
            ex_dividend_date=s.get("ex_dividend_date"),
            analyst_target=s.get("analyst_target"),
            earnings_date=s.get("earnings_date"),
            float_shares=s.get("float_shares"),
            short_ratio=s.get("short_ratio"),
            day_change_pct=s.get("day_change_pct"),
        )
        for s in scored
    ]

    return PlaylistResponse(user_id=user_id, stocks=result)


# --------------------------------------------------------------------------- #
# GET /stock/{ticker}/history                                                  #
# --------------------------------------------------------------------------- #

# Simple in-process caches
_history_cache: dict[tuple[str, str], tuple[float, Any]] = {}
_CACHE_TTL = 300  # 5 minutes

_quote_cache: dict[str, tuple[float, Any]] = {}
_QUOTE_TTL = 300  # 5 minutes


@app.get("/stock/{ticker}/history", tags=["market-data"])
def stock_history(
    ticker: str,
    period: str = Query(default="1M", description="1D | 5D | 1M | 6M | YTD | 1Y | 5Y | All"),
) -> dict:
    """
    Return OHLCV price history for a ticker and period.
    Results are cached in-process for 5 minutes to avoid hammering yfinance.
    """
    cache_key = (ticker.upper(), period)
    now = time.time()

    cached = _history_cache.get(cache_key)
    if cached and (now - cached[0]) < _CACHE_TTL:
        return cached[1]

    result = fetch_ohlcv(ticker.upper(), period)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No data for {ticker} / {period}")

    _history_cache[cache_key] = (now, result)
    return result


# --------------------------------------------------------------------------- #
# GET /stock/{ticker}/quote                                                    #
# --------------------------------------------------------------------------- #

@app.get("/stock/{ticker}/quote", tags=["market-data"])
def stock_quote(ticker: str) -> dict:
    """
    Live price quote using yfinance fast_info. Cached for 2 minutes.
    Returns: price, day_change_pct, day_low, day_high,
             week_52_low, week_52_high, volume, market_cap.
    """
    key = ticker.upper()
    now = time.time()

    cached = _quote_cache.get(key)
    if cached and (now - cached[0]) < _QUOTE_TTL:
        return cached[1]

    result = fetch_live_quote(key)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No quote data for {ticker}")

    _quote_cache[key] = (now, result)
    return result


# --------------------------------------------------------------------------- #
# GET /stock/{ticker}/news                                                     #
# --------------------------------------------------------------------------- #

@app.get("/stock/{ticker}/news", tags=["market-data"])
def stock_news(ticker: str) -> dict:
    """
    Return top 3 news articles with sentiment for a ticker via yfinance.
    """
    articles = fetch_news_articles(ticker.upper())
    return {"ticker": ticker.upper(), "articles": articles}
