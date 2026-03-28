"""Thompson Sampling scorer for stock exploration.

Each stock has a Beta distribution parameterised by (alpha, beta):
  - alpha increases when a user swipes right on the stock.
  - beta  increases when a user swipes left on the stock.
  - Both start at 1.0 (flat prior — no preference either way).

Sampling from Beta(alpha, beta) gives an optimistic estimate of how much
a new user might like this stock. Stocks that haven't been seen much have
high uncertainty, so they'll occasionally score high and get shown — this
is the exploration mechanism.
"""

import numpy as np
from scipy.stats import beta as beta_dist


def thompson_score(alpha: float, beta: float) -> float:
    """
    Draw one sample from Beta(alpha, beta).

    A higher alpha/beta ratio means the stock has been liked more than disliked.
    Stocks with low total swipes (alpha + beta near 2) have high variance and
    will sometimes sample high, giving them a chance to be discovered.

    Returns a float in [0, 1].
    """
    # Clamp to valid Beta distribution bounds (both params must be > 0)
    a = max(alpha, 1e-6)
    b = max(beta, 1e-6)
    return float(beta_dist.rvs(a, b))


def thompson_scores_batch(stocks: list[dict]) -> dict[str, float]:
    """
    Compute Thompson Sampling scores for a list of stocks in one vectorised call.

    Each stock dict must contain: 'ticker', 'alpha', 'beta'.

    Uses numpy vectorisation: all Beta samples are drawn in a single scipy call
    rather than one at a time, which is significantly faster for large universes.

    Returns:
        dict mapping ticker → thompson_score (float in [0, 1])
    """
    if not stocks:
        return {}

    tickers = [s["ticker"] for s in stocks]
    alphas  = np.array([max(float(s.get("alpha", 1.0)), 1e-6) for s in stocks])
    betas   = np.array([max(float(s.get("beta",  1.0)), 1e-6) for s in stocks])

    # scipy's beta.rvs accepts array inputs — one sample per (alpha_i, beta_i) pair
    samples = beta_dist.rvs(alphas, betas).astype(float)

    return dict(zip(tickers, samples.tolist()))
