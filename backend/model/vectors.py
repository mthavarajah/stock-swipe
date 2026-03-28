"""User vector operations: initialisation from quiz, cosine similarity, and swipe updates.

The user vector is a 6-dimensional float array representing taste preferences:
  [growth, value, esg, volatility, momentum, dividend]

All vectors (user and stock) are kept L2-normalised so that cosine similarity
reduces to a plain dot product — fast and numerically stable.
"""

import numpy as np

# Vector dimension order — used as documentation and index constants
DIM_GROWTH     = 0
DIM_VALUE      = 1
DIM_ESG        = 2
DIM_VOLATILITY = 3
DIM_MOMENTUM   = 4
DIM_DIVIDEND   = 5

VECTOR_DIM = 6
LEARNING_RATE = 0.1  # default step size for user vector updates


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #

def _l2_normalize(vec: np.ndarray) -> np.ndarray:
    """Return the L2-normalised version of vec. Returns zeros if norm is 0."""
    norm = np.linalg.norm(vec)
    if norm == 0.0:
        return np.zeros(VECTOR_DIM, dtype=np.float32)
    return (vec / norm).astype(np.float32)


# --------------------------------------------------------------------------- #
# Quiz → user vector                                                           #
# --------------------------------------------------------------------------- #

def quiz_to_user_vector(answers: dict) -> np.ndarray:
    """
    Map onboarding quiz answers to an L2-normalised 6-dim preference vector.

    Expected keys in `answers`:
      style       : float in [0, 1]  — 0 = pure value, 1 = pure growth
      esg         : int   in [1, 5]  — importance of ESG factors
      risk        : str   "low" | "med" | "high"
      horizon     : str   "short" | "long"
      dividends   : str   "yes" | "no"
    """
    vec = np.zeros(VECTOR_DIM, dtype=np.float32)

    # dim 0 — growth: growth/value slider (1 = full growth, 0 = full value)
    style = float(answers.get("style", 0.5))
    vec[DIM_GROWTH] = np.clip(style, 0.0, 1.0)

    # dim 1 — value: inverse of growth preference
    vec[DIM_VALUE] = 1.0 - vec[DIM_GROWTH]

    # dim 2 — esg: importance rating 1-5 → [0.2, 1.0]
    esg_rating = int(answers.get("esg", 3))
    vec[DIM_ESG] = np.clip(esg_rating / 5.0, 0.0, 1.0)

    # dim 3 — volatility tolerance: low=0.2, med=0.5, high=0.8
    risk_map = {"low": 0.2, "med": 0.5, "high": 0.8}
    vec[DIM_VOLATILITY] = risk_map.get(str(answers.get("risk", "med")), 0.5)

    # dim 4 — momentum preference: short horizon cares less, long horizon cares more
    horizon_map = {"short": 0.3, "long": 0.7}
    vec[DIM_MOMENTUM] = horizon_map.get(str(answers.get("horizon", "long")), 0.5)

    # dim 5 — dividend preference: yes=0.8, no=0.2
    dividend_map = {"yes": 0.8, "no": 0.2}
    vec[DIM_DIVIDEND] = dividend_map.get(str(answers.get("dividends", "no")), 0.2)

    return _l2_normalize(vec)


# --------------------------------------------------------------------------- #
# Cosine similarity                                                            #
# --------------------------------------------------------------------------- #

def cosine_similarity(user_vec: np.ndarray, stock_vec: np.ndarray) -> float:
    """
    Compute cosine similarity between two vectors.

    Because both vectors are L2-normalised this is equivalent to their dot product,
    but we compute it explicitly so the function is self-contained and testable.

    Returns a float in [-1, 1]. Returns 0.0 if either vector is all zeros.
    """
    u = np.asarray(user_vec, dtype=np.float64)
    s = np.asarray(stock_vec, dtype=np.float64)

    norm_u = np.linalg.norm(u)
    norm_s = np.linalg.norm(s)

    if norm_u == 0.0 or norm_s == 0.0:
        return 0.0

    return float(np.dot(u, s) / (norm_u * norm_s))


# --------------------------------------------------------------------------- #
# User vector update on swipe                                                  #
# --------------------------------------------------------------------------- #

def update_user_vector(
    user_vec: np.ndarray,
    stock_vec: np.ndarray,
    direction: str,
    learning_rate: float = LEARNING_RATE,
) -> np.ndarray:
    """
    Nudge the user vector toward (right swipe) or away from (left swipe) a stock.

    The learning rate controls how much a single swipe shifts the user's taste
    profile. After updating we clip to non-negative values (features are always
    positive) and re-normalise so future cosine similarities stay meaningful.

    Args:
        user_vec:      Current 6-dim user preference vector (L2-normalised).
        stock_vec:     6-dim stock feature vector (L2-normalised).
        direction:     "right" (liked) or "left" (passed).
        learning_rate: Step size. Default 0.1 (defined in CLAUDE.md).

    Returns:
        Updated L2-normalised user vector.
    """
    u = np.asarray(user_vec, dtype=np.float32).copy()
    s = np.asarray(stock_vec, dtype=np.float32)

    if direction == "right":
        u += learning_rate * s
    elif direction == "left":
        u -= learning_rate * s
    else:
        raise ValueError(f"direction must be 'right' or 'left', got {direction!r}")

    # Stock features are non-negative; keep the user vector in the same space
    u = np.clip(u, 0.0, None)

    return _l2_normalize(u)
