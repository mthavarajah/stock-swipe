"""Hybrid recommendation scorer — the core of the ML engine.

How it works (plain English):
──────────────────────────────────────────────────────────────────────────────
When you first open the app you have no history, so we don't know what you
like yet.  We explore broadly — showing you a diverse mix of stocks.

As you swipe, we learn your taste and gradually shift toward showing you
stocks that genuinely match your profile.  The balance between "explore new
things" and "show what you'll like" is controlled by a single number called
epsilon (ε).

  ε = 1 / (1 + 0.1 × swipe_count)

  • 0 swipes  → ε = 1.0  → pure exploration  (show interesting unknowns)
  • 10 swipes → ε = 0.5  → 50/50 mix
  • 50 swipes → ε = 0.17 → mostly taste-based
  • 100 swipes→ ε = 0.09 → almost entirely personalised

The final score for each stock is:

  score = (1 − ε) × cosine_similarity(you, stock)
        +     ε   × thompson_sample(stock)

  - cosine_similarity measures taste alignment (−1 to 1, scaled to 0-1)
  - thompson_sample   is an exploration bonus drawn from a Beta distribution
──────────────────────────────────────────────────────────────────────────────
"""

import json
from typing import Any

import numpy as np

from db.snowflake import fetch_all
from model.bandit import thompson_scores_batch
from model.vectors import cosine_similarity

# Dimension index → human-readable name (matches features.py order)
_DIM_NAMES = ["growth", "value", "esg", "volatility", "momentum", "dividend"]

# Reason templates keyed by dimension name
_REASON_TEMPLATES: dict[str, str] = {
    "esg":        "Strong ESG credentials in {sector}",
    "growth":     "High growth momentum this quarter",
    "dividend":   "Reliable dividend yield of {dividend_pct}",
    "momentum":   "Trending upward over 90 days",
    "value":      "Trading at an attractive valuation",
    "volatility": "Low volatility, stable performer",
}


# --------------------------------------------------------------------------- #
# Epsilon decay                                                                #
# --------------------------------------------------------------------------- #

def epsilon(swipe_count: int) -> float:
    """
    Exploration rate — decays from 1.0 toward 0 as the user swipes more.

    High ε  → trust Thompson Sampling (explore unknown stocks).
    Low ε   → trust cosine similarity (exploit learned taste profile).
    """
    return 1.0 / (1.0 + 0.1 * swipe_count)


# --------------------------------------------------------------------------- #
# Hybrid score                                                                 #
# --------------------------------------------------------------------------- #

def hybrid_score(cosine: float, thompson: float, swipe_count: int) -> float:
    """
    Combine taste alignment and exploration bonus into a single score in [0, 1].

    Args:
        cosine:      cosine_similarity(user_vec, stock_vec), range [-1, 1].
        thompson:    Beta distribution sample for this stock, range [0, 1].
        swipe_count: Number of swipes the user has made so far.

    Returns:
        A float in [0, 1].
    """
    e = epsilon(swipe_count)

    # Cosine similarity is in [-1, 1]; rescale to [0, 1] so both terms are
    # on the same scale and the final value stays within [0, 1].
    cosine_scaled = (cosine + 1.0) / 2.0

    score = (1.0 - e) * cosine_scaled + e * thompson

    # Clamp defensively — floating-point rounding can push slightly outside [0, 1]
    return float(np.clip(score, 0.0, 1.0))


# --------------------------------------------------------------------------- #
# Reason string                                                                #
# --------------------------------------------------------------------------- #

def generate_reason(stock: dict[str, Any], user_vec: np.ndarray) -> str:
    """
    Produce a one-line human-readable explanation for why this stock was surfaced.

    Strategy: find the dimension where the stock scores highest AND the user
    also has a meaningful preference (> 0.3), then pick the matching template.
    Falls back to a generic message if no dimension stands out.
    """
    vec = stock.get("vector")
    if vec is None:
        return "Matches your investment profile"

    stock_vec = np.asarray(vec, dtype=float)
    user_arr  = np.asarray(user_vec, dtype=float)

    # Score each dimension: high stock value + high user preference = good match
    alignment = stock_vec * np.clip(user_arr, 0.0, None)

    # Pick the best-aligned dimension (must exceed a minimum threshold)
    best_dim = int(np.argmax(alignment))
    if alignment[best_dim] < 0.1:
        return "Matches your investment profile"

    dim_name = _DIM_NAMES[best_dim]
    template = _REASON_TEMPLATES[dim_name]

    # Fill in template variables
    sector  = stock.get("sector") or "its sector"
    div_raw = stock.get("dividend_yield")
    if div_raw:
        # yfinance sometimes returns as decimal (0.056) sometimes as pct (5.6)
        display = div_raw if div_raw > 1 else div_raw * 100
        div_pct = f"{display:.2f}%"
    else:
        div_pct = "N/A"

    return template.format(sector=sector, dividend_pct=div_pct)


# --------------------------------------------------------------------------- #
# Main batch generator                                                         #
# --------------------------------------------------------------------------- #

def get_next_batch(
    user_id: str,
    user_vec: np.ndarray,
    swipe_count: int,
    batch_size: int = 10,
) -> list[dict[str, Any]]:
    """
    Return the top `batch_size` unseen stocks for this user, scored by the
    hybrid model.

    Steps:
      1. Fetch all stocks the user has NOT yet swiped from Snowflake.
      2. Compute cosine similarity between the user vector and each stock vector.
      3. Compute Thompson Sampling scores for all stocks in one vectorised call.
      4. Compute the hybrid score for each stock.
      5. Sort descending by hybrid score.
      6. Return the top `batch_size` stocks with metadata for the frontend.

    Args:
        user_id:     UUID string identifying the user.
        user_vec:    6-dim L2-normalised user preference vector.
        swipe_count: Total number of swipes this user has made.
        batch_size:  Number of stocks to return (default 10).

    Returns:
        List of stock dicts, each containing:
          ticker, name, sector, price, vector,
          hybrid_score, cosine_score, reason.
    """
    # ------------------------------------------------------------------ #
    # 1. Fetch unseen stocks                                               #
    # ------------------------------------------------------------------ #
    # We use a LEFT JOIN + IS NULL pattern to exclude already-swiped stocks.
    unseen_stocks: list[dict] = fetch_all(
        """
        SELECT
            s.ticker,
            s.name,
            s.sector,
            s.price,
            s.market_cap,
            s.pe_ratio,
            s.dividend_yield,
            s.momentum_30d,
            s.volatility_30d,
            s.esg_score,
            s.sentiment_score,
            s.vector,
            s.alpha,
            s.beta,
            s.description,
            s.day_low,
            s.day_high,
            s.week_52_low,
            s.week_52_high,
            s.volume,
            s.avg_volume,
            s.market_beta,
            s.eps,
            s.forward_dividend,
            s.ex_dividend_date,
            s.analyst_target,
            s.earnings_date,
            s.float_shares,
            s.short_ratio,
            s.day_change_pct
        FROM STOCKS s
        LEFT JOIN SWIPES sw
            ON sw.ticker  = s.ticker
            AND sw.user_id = %(user_id)s
        WHERE sw.ticker IS NULL
        """,
        {"user_id": user_id},
    )

    if not unseen_stocks:
        return []

    # ------------------------------------------------------------------ #
    # 2 & 3. Score all unseen stocks                                       #
    # ------------------------------------------------------------------ #

    # Thompson scores — vectorised across all stocks in one call
    thompson_map: dict[str, float] = thompson_scores_batch(unseen_stocks)

    scored: list[dict[str, Any]] = []

    for stock in unseen_stocks:
        ticker = stock["ticker"]

        # Snowflake returns ARRAY columns as Python lists; parse if needed
        raw_vec = stock.get("vector")
        if isinstance(raw_vec, str):
            raw_vec = json.loads(raw_vec)
        if raw_vec is None:
            continue  # skip stocks without a vector (shouldn't happen after Phase 1)

        stock_vec = np.asarray(raw_vec, dtype=np.float32)

        # Cosine similarity between user taste and stock features
        cos_score  = cosine_similarity(user_vec, stock_vec)

        # Thompson exploration bonus
        t_score    = thompson_map.get(ticker, 0.5)

        # Combined score
        h_score    = hybrid_score(cos_score, t_score, swipe_count)

        # Human-readable reason
        stock["vector"] = raw_vec          # ensure it's a list, not raw string
        reason = generate_reason(stock, user_vec)

        scored.append({
            "ticker":          ticker,
            "name":            stock.get("name"),
            "sector":          stock.get("sector"),
            "price":           stock.get("price"),
            "market_cap":      stock.get("market_cap"),
            "pe_ratio":        stock.get("pe_ratio"),
            "dividend_yield":  stock.get("dividend_yield"),
            "momentum_30d":    stock.get("momentum_30d"),
            "volatility_30d":  stock.get("volatility_30d"),
            "esg_score":       stock.get("esg_score"),
            "sentiment_score": stock.get("sentiment_score"),
            "vector":          raw_vec,
            "hybrid_score":    h_score,
            "cosine_score":    cos_score,
            "reason":          reason,
            # enriched fields
            "description":     stock.get("description"),
            "day_low":         stock.get("day_low"),
            "day_high":        stock.get("day_high"),
            "week_52_low":     stock.get("week_52_low"),
            "week_52_high":    stock.get("week_52_high"),
            "volume":          stock.get("volume"),
            "avg_volume":      stock.get("avg_volume"),
            "market_beta":     stock.get("market_beta"),
            "eps":             stock.get("eps"),
            "forward_dividend":stock.get("forward_dividend"),
            "ex_dividend_date":stock.get("ex_dividend_date"),
            "analyst_target":  stock.get("analyst_target"),
            "earnings_date":   stock.get("earnings_date"),
            "float_shares":    stock.get("float_shares"),
            "short_ratio":     stock.get("short_ratio"),
            "day_change_pct":  stock.get("day_change_pct"),
        })

    # ------------------------------------------------------------------ #
    # 4. Sort and return top batch_size                                    #
    # ------------------------------------------------------------------ #
    scored.sort(key=lambda x: x["hybrid_score"], reverse=True)
    return scored[:batch_size]
