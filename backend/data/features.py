"""Engineer 6-dim feature vectors from raw stock data.

Dimensions (in order):
  0 growth     — 30-day price momentum
  1 value      — 1 / pe_ratio, clipped [0, 1]
  2 esg        — totalEsg / 100, default 0.5 if missing
  3 volatility — inverted 30-day rolling std (lower vol → higher score)
  4 momentum   — 90-day price momentum
  5 dividend   — dividend yield, clipped [0, 0.10]
"""

import numpy as np
from sklearn.preprocessing import MinMaxScaler


# --------------------------------------------------------------------------- #
# Raw feature extraction (per stock)                                           #
# --------------------------------------------------------------------------- #

ESG_DEFAULT = 0.5
VECTOR_DIM = 6


def extract_raw_features(raw: dict) -> list[float | None]:
    """
    Convert a raw-data dict (from fetch.py) into an ordered list of 6 raw
    feature values. None indicates the value is missing and will be imputed
    after scaling.
    """
    # growth: 30-day momentum (can be negative)
    growth = raw.get("momentum_30d")

    # value: 1 / PE, clipped [0, 1]
    pe = raw.get("pe_ratio")
    if pe and pe > 0:
        value = min(1.0 / pe, 1.0)
    else:
        value = None

    # esg: totalEsg / 100, fallback to ESG_DEFAULT
    esg_raw = raw.get("esg_score")
    if esg_raw is not None and not np.isnan(float(esg_raw)):
        esg = float(esg_raw) / 100.0
    else:
        esg = ESG_DEFAULT  # known default — do NOT impute this later

    # volatility: raw std (we will invert after MinMaxScaling)
    volatility = raw.get("volatility_30d")

    # momentum: 90-day
    momentum = raw.get("momentum_90d")

    # dividend: yield clipped [0, 0.10]
    div = raw.get("dividend_yield")
    if div is not None:
        dividend = min(max(float(div), 0.0), 0.10)
    else:
        dividend = None

    return [growth, value, esg, volatility, momentum, dividend]


# --------------------------------------------------------------------------- #
# Universe-level normalization                                                 #
# --------------------------------------------------------------------------- #

def build_feature_matrix(raw_stocks: list[dict]) -> tuple[np.ndarray, list[str]]:
    """
    Given a list of raw-data dicts, return:
      - feature_matrix: shape (N, 6), NaN where data is missing
      - tickers:        list of N ticker strings (same order)
    """
    tickers = []
    rows = []
    for s in raw_stocks:
        tickers.append(s["ticker"])
        rows.append(extract_raw_features(s))

    matrix = np.array(rows, dtype=float)  # NaN for None
    return matrix, tickers


def normalize_features(matrix: np.ndarray) -> np.ndarray:
    """
    1. Impute column-wise medians for any NaN (except ESG col which never has NaN).
    2. MinMaxScale each dimension across the stock universe → [0, 1].
    3. Invert the volatility column (dim 3) so low-vol → high score.
    4. L2-normalize each row so cosine similarity works correctly.

    Returns an (N, 6) array of float32.
    """
    mat = matrix.copy()

    # --- impute missing values with column median -------------------------
    for col in range(VECTOR_DIM):
        col_data = mat[:, col]
        nan_mask = np.isnan(col_data)
        if nan_mask.all():
            mat[:, col] = 0.0
        elif nan_mask.any():
            median = float(np.nanmedian(col_data))
            mat[nan_mask, col] = median

    # --- MinMaxScale per dimension ----------------------------------------
    scaler = MinMaxScaler(feature_range=(0.0, 1.0))
    mat = scaler.fit_transform(mat)  # shape (N, 6), all in [0, 1]

    # --- invert volatility (col 3): lower raw vol → higher score -----------
    mat[:, 3] = 1.0 - mat[:, 3]

    # --- L2 normalise each row -------------------------------------------
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    # avoid div-by-zero for a zero vector
    norms = np.where(norms == 0, 1.0, norms)
    mat = mat / norms

    return mat.astype(np.float32)


# --------------------------------------------------------------------------- #
# Public helper: build vectors for the full universe                           #
# --------------------------------------------------------------------------- #

def compute_vectors(raw_stocks: list[dict]) -> list[dict]:
    """
    Run the full feature pipeline over a list of raw-data dicts.

    Returns a list of dicts, each extending the original raw dict with:
      - "vector": list[float] of length 6 (L2-normalised)

    Stocks for which price data was unavailable are dropped.
    """
    valid = [s for s in raw_stocks if s is not None]
    if not valid:
        return []

    matrix, tickers = build_feature_matrix(valid)
    normalized = normalize_features(matrix)

    result = []
    for i, raw in enumerate(valid):
        enriched = dict(raw)
        enriched["vector"] = normalized[i].tolist()
        result.append(enriched)

    return result
