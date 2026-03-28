"""Unit tests for the ML model engine.

Run with:
    cd backend
    python -m pytest model/test_model.py -v
"""

import json
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from model.bandit import thompson_score, thompson_scores_batch
from model.scorer import epsilon, generate_reason, hybrid_score
from model.vectors import (
    cosine_similarity,
    quiz_to_user_vector,
    update_user_vector,
)


# =========================================================================== #
# Helpers                                                                      #
# =========================================================================== #

def _unit_vec(values: list[float]) -> np.ndarray:
    """Return a normalised numpy array from a list."""
    v = np.array(values, dtype=np.float32)
    return v / np.linalg.norm(v)


# =========================================================================== #
# vectors.py                                                                   #
# =========================================================================== #

class TestCosimeSimilarity:
    def test_parallel_vectors_score_one(self):
        v = _unit_vec([1.0, 0.0, 0.0, 0.0, 0.0, 0.0])
        assert cosine_similarity(v, v) == pytest.approx(1.0, abs=1e-6)

    def test_opposite_vectors_score_negative_one(self):
        v  = _unit_vec([1.0, 0.0, 0.0, 0.0, 0.0, 0.0])
        nv = -v
        assert cosine_similarity(v, nv) == pytest.approx(-1.0, abs=1e-6)

    def test_orthogonal_vectors_score_zero(self):
        a = _unit_vec([1.0, 0.0, 0.0, 0.0, 0.0, 0.0])
        b = _unit_vec([0.0, 1.0, 0.0, 0.0, 0.0, 0.0])
        assert cosine_similarity(a, b) == pytest.approx(0.0, abs=1e-6)

    def test_zero_vector_returns_zero(self):
        v    = _unit_vec([1.0, 0.5, 0.5, 0.5, 0.5, 0.5])
        zero = np.zeros(6, dtype=np.float32)
        assert cosine_similarity(v, zero) == 0.0
        assert cosine_similarity(zero, v) == 0.0

    def test_result_in_range(self):
        rng = np.random.default_rng(42)
        for _ in range(50):
            a = _unit_vec(rng.random(6).tolist())
            b = _unit_vec(rng.random(6).tolist())
            score = cosine_similarity(a, b)
            assert -1.0 - 1e-6 <= score <= 1.0 + 1e-6


class TestUpdateUserVector:
    def test_right_swipe_moves_toward_stock(self):
        user  = _unit_vec([0.1, 0.1, 0.1, 0.1, 0.1, 0.1])
        stock = _unit_vec([1.0, 0.0, 0.0, 0.0, 0.0, 0.0])
        updated = update_user_vector(user, stock, "right")
        # After a right swipe on a high-growth stock, growth dim should increase
        assert updated[0] > user[0]

    def test_left_swipe_moves_away_from_stock(self):
        # Start with a user heavily weighted toward growth
        user  = _unit_vec([0.9, 0.1, 0.1, 0.1, 0.1, 0.1])
        stock = _unit_vec([1.0, 0.0, 0.0, 0.0, 0.0, 0.0])
        updated = update_user_vector(user, stock, "left")
        assert updated[0] < user[0]

    def test_result_is_always_l2_normalised(self):
        user  = _unit_vec([0.5, 0.3, 0.1, 0.4, 0.2, 0.6])
        stock = _unit_vec([0.2, 0.8, 0.3, 0.1, 0.5, 0.4])
        for direction in ("right", "left"):
            updated = update_user_vector(user, stock, direction)
            assert np.linalg.norm(updated) == pytest.approx(1.0, abs=1e-5)

    def test_no_negative_dimensions(self):
        user  = _unit_vec([0.1, 0.1, 0.1, 0.1, 0.1, 0.1])
        stock = _unit_vec([0.9, 0.9, 0.9, 0.9, 0.9, 0.9])
        updated = update_user_vector(user, stock, "left", learning_rate=5.0)
        assert np.all(updated >= 0.0)

    def test_converges_to_stock_after_many_right_swipes(self):
        """After many right swipes on the same stock, user_vec ≈ stock_vec."""
        stock   = _unit_vec([0.8, 0.1, 0.5, 0.2, 0.7, 0.3])
        user    = _unit_vec([0.1, 0.9, 0.1, 0.8, 0.1, 0.9])
        for _ in range(50):
            user = update_user_vector(user, stock, "right")
        # cosine similarity should be very high
        assert cosine_similarity(user, stock) > 0.99

    def test_invalid_direction_raises(self):
        v = _unit_vec([0.5] * 6)
        with pytest.raises(ValueError):
            update_user_vector(v, v, "maybe")


class TestQuizToUserVector:
    def test_output_is_l2_normalised(self):
        answers = {"style": 0.7, "esg": 4, "risk": "high", "horizon": "long", "dividends": "yes"}
        vec = quiz_to_user_vector(answers)
        assert np.linalg.norm(vec) == pytest.approx(1.0, abs=1e-5)

    def test_output_dim_is_six(self):
        vec = quiz_to_user_vector({})
        assert len(vec) == 6

    def test_high_esg_preference_reflected(self):
        low_esg  = quiz_to_user_vector({"esg": 1})
        high_esg = quiz_to_user_vector({"esg": 5})
        # ESG dim is index 2; higher rating → larger raw component before normalisation
        # After normalisation the ratio between vectors reflects the preference
        assert high_esg[2] > low_esg[2]

    def test_growth_value_are_complementary(self):
        growth_focused = quiz_to_user_vector({"style": 1.0})
        value_focused  = quiz_to_user_vector({"style": 0.0})
        assert growth_focused[0] > value_focused[0]  # growth dim
        assert value_focused[1]  > growth_focused[1]  # value dim


# =========================================================================== #
# bandit.py                                                                    #
# =========================================================================== #

class TestThompsonScore:
    def test_in_unit_interval(self):
        for _ in range(100):
            s = thompson_score(1.0, 1.0)
            assert 0.0 <= s <= 1.0

    def test_biased_distribution(self):
        """alpha >> beta should produce scores concentrated near 1."""
        scores = [thompson_score(100.0, 1.0) for _ in range(200)]
        assert np.mean(scores) > 0.9

    def test_extreme_params_dont_crash(self):
        assert 0.0 <= thompson_score(1e-9, 1e-9) <= 1.0
        assert 0.0 <= thompson_score(1e6,  1e6)  <= 1.0


class TestThompsonScoresBatch:
    def test_returns_all_tickers(self):
        stocks = [
            {"ticker": "AAPL", "alpha": 2.0, "beta": 1.0},
            {"ticker": "MSFT", "alpha": 1.0, "beta": 3.0},
            {"ticker": "TSLA", "alpha": 1.0, "beta": 1.0},
        ]
        result = thompson_scores_batch(stocks)
        assert set(result.keys()) == {"AAPL", "MSFT", "TSLA"}

    def test_all_scores_in_unit_interval(self):
        stocks = [{"ticker": f"T{i}", "alpha": float(i + 1), "beta": 1.0} for i in range(20)]
        result = thompson_scores_batch(stocks)
        for v in result.values():
            assert 0.0 <= v <= 1.0

    def test_empty_input(self):
        assert thompson_scores_batch([]) == {}


# =========================================================================== #
# scorer.py                                                                    #
# =========================================================================== #

class TestEpsilon:
    def test_zero_swipes_returns_one(self):
        assert epsilon(0) == pytest.approx(1.0)

    def test_ten_swipes_returns_half(self):
        assert epsilon(10) == pytest.approx(0.5)

    def test_fifty_swipes(self):
        assert epsilon(50) == pytest.approx(1.0 / 6.0, abs=1e-6)

    def test_approaches_zero(self):
        assert epsilon(10_000) < 0.01

    def test_always_positive(self):
        for n in range(0, 1000, 50):
            assert epsilon(n) > 0.0


class TestHybridScore:
    def test_in_unit_interval_random_inputs(self):
        rng = np.random.default_rng(0)
        for _ in range(200):
            cos = float(rng.uniform(-1, 1))
            tho = float(rng.uniform(0, 1))
            cnt = int(rng.integers(0, 200))
            score = hybrid_score(cos, tho, cnt)
            assert 0.0 - 1e-9 <= score <= 1.0 + 1e-9

    def test_pure_exploration_at_zero_swipes(self):
        """At 0 swipes epsilon=1, so hybrid_score ≈ thompson score."""
        # cosine = 1.0 → scaled 1.0; thompson = 0.0
        # score = 0 * 1.0 + 1 * 0.0 = 0.0
        assert hybrid_score(cosine=1.0, thompson=0.0, swipe_count=0) == pytest.approx(0.0)

    def test_pure_exploitation_at_many_swipes(self):
        """At very high swipe count epsilon≈0, so hybrid ≈ cosine_scaled."""
        # cosine = 1.0 → scaled = 1.0; epsilon ≈ 0
        score = hybrid_score(cosine=1.0, thompson=0.0, swipe_count=100_000)
        assert score > 0.99


class TestGetNextBatch:
    """Integration-level tests using mocked Snowflake calls."""

    def _make_stock(self, ticker: str, alpha: float = 1.0, beta: float = 1.0) -> dict:
        vec = _unit_vec([0.5, 0.3, 0.4, 0.2, 0.6, 0.1]).tolist()
        return {
            "ticker": ticker,
            "name": f"{ticker} Inc.",
            "sector": "Technology",
            "price": 100.0,
            "market_cap": 1e9,
            "pe_ratio": 20.0,
            "dividend_yield": 0.02,
            "momentum_30d": 0.05,
            "volatility_30d": 0.01,
            "esg_score": 65.0,
            "sentiment_score": 0.1,
            "vector": vec,
            "alpha": alpha,
            "beta": beta,
        }

    @patch("model.scorer.fetch_all")
    def test_returns_exactly_batch_size(self, mock_fetch):
        stocks = [self._make_stock(f"T{i:03d}") for i in range(50)]
        mock_fetch.return_value = stocks

        user_vec = _unit_vec([0.5, 0.5, 0.5, 0.5, 0.5, 0.5])
        from backend.model.scorer import get_next_batch
        result = get_next_batch("user-123", user_vec, swipe_count=5, batch_size=10)

        assert len(result) == 10

    @patch("model.scorer.fetch_all")
    def test_all_stocks_have_required_fields(self, mock_fetch):
        stocks = [self._make_stock(f"T{i:03d}") for i in range(20)]
        mock_fetch.return_value = stocks

        user_vec = _unit_vec([0.5] * 6)
        from backend.model.scorer import get_next_batch
        result = get_next_batch("user-abc", user_vec, swipe_count=0, batch_size=5)

        required = {"ticker", "name", "sector", "price", "vector", "hybrid_score", "cosine_score", "reason"}
        for stock in result:
            assert required.issubset(stock.keys())

    @patch("model.scorer.fetch_all")
    def test_hybrid_scores_in_unit_interval(self, mock_fetch):
        stocks = [self._make_stock(f"T{i:03d}") for i in range(30)]
        mock_fetch.return_value = stocks

        user_vec = _unit_vec([0.5] * 6)
        from backend.model.scorer import get_next_batch
        result = get_next_batch("user-xyz", user_vec, swipe_count=20, batch_size=10)

        for stock in result:
            assert 0.0 <= stock["hybrid_score"] <= 1.0

    @patch("model.scorer.fetch_all")
    def test_returns_fewer_than_batch_size_when_universe_is_small(self, mock_fetch):
        stocks = [self._make_stock("ONLY")]
        mock_fetch.return_value = stocks

        user_vec = _unit_vec([0.5] * 6)
        from backend.model.scorer import get_next_batch
        result = get_next_batch("user-1", user_vec, swipe_count=0, batch_size=10)

        assert len(result) == 1

    @patch("model.scorer.fetch_all")
    def test_fetch_all_called_with_correct_user_id(self, mock_fetch):
        mock_fetch.return_value = []

        user_vec = _unit_vec([0.5] * 6)
        from backend.model.scorer import get_next_batch
        get_next_batch("user-UNIQUE", user_vec, swipe_count=0)

        mock_fetch.assert_called_once()
        call_params = mock_fetch.call_args[0][1]
        assert call_params["user_id"] == "user-UNIQUE"


class TestGenerateReason:
    def test_returns_a_string(self):
        stock = {
            "sector": "Technology",
            "dividend_yield": 0.02,
            "vector": _unit_vec([0.9, 0.1, 0.1, 0.1, 0.1, 0.1]).tolist(),
        }
        user_vec = _unit_vec([0.9, 0.1, 0.1, 0.1, 0.1, 0.1])
        reason = generate_reason(stock, user_vec)
        assert isinstance(reason, str)
        assert len(reason) > 0

    def test_esg_reason_includes_sector(self):
        vec = _unit_vec([0.0, 0.0, 1.0, 0.0, 0.0, 0.0]).tolist()
        stock = {"sector": "Utilities", "dividend_yield": None, "vector": vec}
        user_vec = _unit_vec([0.0, 0.0, 1.0, 0.0, 0.0, 0.0])
        reason = generate_reason(stock, user_vec)
        assert "Utilities" in reason

    def test_missing_vector_returns_fallback(self):
        stock = {"sector": "Finance", "dividend_yield": 0.03, "vector": None}
        user_vec = _unit_vec([0.5] * 6)
        reason = generate_reason(stock, user_vec)
        assert "profile" in reason.lower()
