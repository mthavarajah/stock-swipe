"""Snowflake connection helper and query functions."""

import json
import os
from typing import Any

import snowflake.connector
from snowflake.connector import DictCursor


def get_conn() -> snowflake.connector.SnowflakeConnection:
    return snowflake.connector.connect(
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        warehouse=os.environ["SNOWFLAKE_WAREHOUSE"],
        database=os.environ["SNOWFLAKE_DATABASE"],
        schema=os.environ["SNOWFLAKE_SCHEMA"],
    )


def execute(query: str, params: tuple = ()) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)


def _lower_keys(row: dict) -> dict:
    """Snowflake DictCursor returns uppercase column names; normalise to lowercase."""
    return {k.lower(): v for k, v in row.items()}


def fetch_one(query: str, params: tuple = ()) -> dict | None:
    with get_conn() as conn:
        with conn.cursor(DictCursor) as cur:
            cur.execute(query, params)
            row = cur.fetchone()
            return _lower_keys(row) if row else None


def fetch_all(query: str, params: tuple = ()) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(DictCursor) as cur:
            cur.execute(query, params)
            return [_lower_keys(r) for r in cur.fetchall()]


def upsert_stock(stock: dict[str, Any]) -> None:
    """Insert or update a stock row. vector must be a Python list of 6 floats."""
    vector_json = json.dumps(stock["vector"])
    query = """
        MERGE INTO STOCKS AS tgt
        USING (
            SELECT
                %(ticker)s            AS ticker,
                %(name)s              AS name,
                %(sector)s            AS sector,
                PARSE_JSON(%(vector_json)s) AS vector,
                %(alpha)s             AS alpha,
                %(beta)s              AS beta,
                %(price)s             AS price,
                %(market_cap)s        AS market_cap,
                %(pe_ratio)s          AS pe_ratio,
                %(dividend_yield)s    AS dividend_yield,
                %(momentum_30d)s      AS momentum_30d,
                %(volatility_30d)s    AS volatility_30d,
                %(esg_score)s         AS esg_score,
                %(sentiment_score)s   AS sentiment_score,
                %(description)s       AS description,
                %(day_low)s           AS day_low,
                %(day_high)s          AS day_high,
                %(week_52_low)s       AS week_52_low,
                %(week_52_high)s      AS week_52_high,
                %(volume)s            AS volume,
                %(avg_volume)s        AS avg_volume,
                %(market_beta)s       AS market_beta,
                %(eps)s               AS eps,
                %(forward_dividend)s  AS forward_dividend,
                %(ex_dividend_date)s  AS ex_dividend_date,
                %(analyst_target)s    AS analyst_target,
                %(earnings_date)s     AS earnings_date,
                %(float_shares)s      AS float_shares,
                %(short_ratio)s       AS short_ratio,
                %(day_change_pct)s    AS day_change_pct
        ) AS src ON tgt.ticker = src.ticker
        WHEN MATCHED THEN UPDATE SET
            name             = src.name,
            sector           = src.sector,
            vector           = src.vector,
            alpha            = src.alpha,
            beta             = src.beta,
            price            = src.price,
            market_cap       = src.market_cap,
            pe_ratio         = src.pe_ratio,
            dividend_yield   = src.dividend_yield,
            momentum_30d     = src.momentum_30d,
            volatility_30d   = src.volatility_30d,
            esg_score        = src.esg_score,
            sentiment_score  = src.sentiment_score,
            description      = src.description,
            day_low          = src.day_low,
            day_high         = src.day_high,
            week_52_low      = src.week_52_low,
            week_52_high     = src.week_52_high,
            volume           = src.volume,
            avg_volume       = src.avg_volume,
            market_beta      = src.market_beta,
            eps              = src.eps,
            forward_dividend = src.forward_dividend,
            ex_dividend_date = src.ex_dividend_date,
            analyst_target   = src.analyst_target,
            earnings_date    = src.earnings_date,
            float_shares     = src.float_shares,
            short_ratio      = src.short_ratio,
            day_change_pct   = src.day_change_pct,
            updated_at       = CURRENT_TIMESTAMP
        WHEN NOT MATCHED THEN INSERT (
            ticker, name, sector, vector, alpha, beta,
            price, market_cap, pe_ratio, dividend_yield,
            momentum_30d, volatility_30d, esg_score, sentiment_score,
            description, day_low, day_high, week_52_low, week_52_high,
            volume, avg_volume, market_beta, eps, forward_dividend,
            ex_dividend_date, analyst_target, earnings_date,
            float_shares, short_ratio, day_change_pct
        ) VALUES (
            src.ticker, src.name, src.sector, src.vector, src.alpha, src.beta,
            src.price, src.market_cap, src.pe_ratio, src.dividend_yield,
            src.momentum_30d, src.volatility_30d, src.esg_score, src.sentiment_score,
            src.description, src.day_low, src.day_high, src.week_52_low, src.week_52_high,
            src.volume, src.avg_volume, src.market_beta, src.eps, src.forward_dividend,
            src.ex_dividend_date, src.analyst_target, src.earnings_date,
            src.float_shares, src.short_ratio, src.day_change_pct
        )
    """
    params = {
        "ticker":           stock["ticker"],
        "name":             stock.get("name"),
        "sector":           stock.get("sector"),
        "vector_json":      vector_json,
        "alpha":            stock.get("alpha", 1.0),
        "beta":             stock.get("beta", 1.0),
        "price":            stock.get("price"),
        "market_cap":       stock.get("market_cap"),
        "pe_ratio":         stock.get("pe_ratio"),
        "dividend_yield":   stock.get("dividend_yield"),
        "momentum_30d":     stock.get("momentum_30d"),
        "volatility_30d":   stock.get("volatility_30d"),
        "esg_score":        stock.get("esg_score"),
        "sentiment_score":  stock.get("sentiment_score"),
        "description":      stock.get("description"),
        "day_low":          stock.get("day_low"),
        "day_high":         stock.get("day_high"),
        "week_52_low":      stock.get("week_52_low"),
        "week_52_high":     stock.get("week_52_high"),
        "volume":           stock.get("volume"),
        "avg_volume":       stock.get("avg_volume"),
        "market_beta":      stock.get("market_beta"),
        "eps":              stock.get("eps"),
        "forward_dividend": stock.get("forward_dividend"),
        "ex_dividend_date": stock.get("ex_dividend_date"),
        "analyst_target":   stock.get("analyst_target"),
        "earnings_date":    stock.get("earnings_date"),
        "float_shares":     stock.get("float_shares"),
        "short_ratio":      stock.get("short_ratio"),
        "day_change_pct":   stock.get("day_change_pct"),
    }
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)


def upsert_user(user: dict[str, Any]) -> None:
    """Insert or update a user row. user_vector must be a Python list of 6 floats."""
    vector_json = json.dumps(user["user_vector"])
    query = """
        MERGE INTO USERS AS tgt
        USING (
            SELECT
                %(user_id)s     AS user_id,
                PARSE_JSON(%(vector_json)s) AS user_vector,
                %(swipe_count)s AS swipe_count
        ) AS src ON tgt.user_id = src.user_id
        WHEN MATCHED THEN UPDATE SET
            user_vector = src.user_vector,
            swipe_count = src.swipe_count
        WHEN NOT MATCHED THEN INSERT (user_id, user_vector, swipe_count)
        VALUES (src.user_id, src.user_vector, src.swipe_count)
    """
    params = {
        "user_id":     user["user_id"],
        "vector_json": vector_json,
        "swipe_count": user.get("swipe_count", 0),
    }
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
