import numpy as np
import pytest

from experiments import stats


def test_naive_p_matches_scipy_ttest_large_n():
    from scipy.stats import ttest_ind

    rng = np.random.default_rng(1)
    a, b = rng.normal(0, 1, 5000), rng.normal(0.05, 1, 5000)
    d, V = stats.diff_and_var(a, b)
    assert abs(float(stats.naive_p(d, V)) - ttest_ind(b, a, equal_var=False).pvalue) < 1e-3


def test_msprt_lambda_closed_form():
    d, V, tau2 = 0.3, 0.01, 0.04
    lam = np.sqrt(V / (V + tau2)) * np.exp(d * d * tau2 / (2 * V * (V + tau2)))
    assert abs(np.exp(stats.msprt_log_lambda(d, V, tau2)) - lam) < 1e-9


def test_msprt_more_conservative_than_naive_at_one_look():
    assert stats.msprt_p(0.02, 0.0001, 0.01) > stats.naive_p(0.02, 0.0001)


def test_always_valid_ci_contains_estimate_and_is_wider():
    lo, hi = stats.always_valid_ci(0.1, 0.0004, 0.01)
    assert lo < 0.1 < hi and (hi - lo) / 2 > 1.96 * 0.02


def test_cuped_reduces_variance_and_keeps_mean():
    rng = np.random.default_rng(2)
    x = rng.normal(10, 3, 20000)
    y = x * 0.8 + rng.normal(0, 1, 20000)
    adj = stats.cuped_adjust(y, x)
    assert abs(adj.mean() - y.mean()) < 1e-9
    assert adj.var() < 0.2 * y.var()


def test_analyze_detects_real_effect_and_reports_cuped():
    rng = np.random.default_rng(3)
    xc, xt = rng.gamma(2, 2, 4000), rng.gamma(2, 2, 4000)
    yc = xc + rng.normal(0, 1, 4000)
    yt = xt + 0.3 + rng.normal(0, 1, 4000)
    r = stats.analyze(yc, yt, xc, xt)
    assert r["decision"] == "ship" and r["cuped"]["variance_reduction"] > 0.5
    assert r["always_valid_ci"][0] < 0.3 < r["always_valid_ci"][1]
    assert len(r["looks"]) == 10


def test_analyze_needs_data():
    with pytest.raises(ValueError):
        stats.analyze([1, 2], [3, 4])
