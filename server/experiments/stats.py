"""A/B test statistics: Welch z-test, CUPED, and mSPRT always-valid p-values.

Everything is numpy-vectorized over leading axes so the simulator can run thousands of
experiments at once with the exact same functions the API uses.

mSPRT reference: Johari, Pekelis, Walsh, "Always Valid Inference: Continuous Monitoring of
A/B Tests" (2017). With delta_hat ~ N(delta, V) and a N(0, tau^2) mixing prior on delta, the
mixture likelihood ratio against delta = 0 is

    Lambda = sqrt(V / (V + tau^2)) * exp(delta_hat^2 * tau^2 / (2 V (V + tau^2)))

and p_t = min(p_{t-1}, 1 / Lambda_t) is a p-value that stays valid under continuous peeking.
CUPED reference: Deng, Xu, Kohavi, Walker, "Improving the Sensitivity of Online Controlled
Experiments by Utilizing Pre-Experiment Data" (2013).
"""
from __future__ import annotations

import numpy as np
from scipy import stats as sps


def naive_p(delta_hat, V):
    """Two-sided fixed-horizon z-test p-value."""
    z = np.asarray(delta_hat) / np.sqrt(V)
    return 2.0 * sps.norm.sf(np.abs(z))


def msprt_log_lambda(delta_hat, V, tau2):
    delta_hat = np.asarray(delta_hat, dtype=float)
    V = np.asarray(V, dtype=float)
    return 0.5 * np.log(V / (V + tau2)) + (delta_hat ** 2) * tau2 / (2.0 * V * (V + tau2))


def msprt_p(delta_hat, V, tau2):
    """Instantaneous 1/Lambda (capped at 1). Take a running minimum across looks."""
    return np.minimum(1.0, np.exp(-msprt_log_lambda(delta_hat, V, tau2)))


def always_valid_ci(delta_hat, V, tau2, alpha=0.05):
    """Confidence sequence half-width for the mixture with a N(0, tau^2) prior."""
    V = np.asarray(V, dtype=float)
    half = np.sqrt(V * (V + tau2) / tau2 * (np.log((V + tau2) / V) - 2.0 * np.log(alpha)))
    return np.asarray(delta_hat) - half, np.asarray(delta_hat) + half


def cuped_theta(y, x):
    """theta = cov(X, Y) / var(X), pooled over both arms (last axis = units)."""
    xc = x - x.mean(axis=-1, keepdims=True)
    yc = y - y.mean(axis=-1, keepdims=True)
    var_x = (xc * xc).mean(axis=-1)
    cov = (xc * yc).mean(axis=-1)
    return np.where(var_x > 0, cov / np.where(var_x > 0, var_x, 1.0), 0.0)


def cuped_adjust(y, x, theta=None, x_mean=None):
    y = np.asarray(y, dtype=float)
    x = np.asarray(x, dtype=float)
    if theta is None:
        theta = cuped_theta(y, x)
    if x_mean is None:
        x_mean = x.mean(axis=-1, keepdims=True)
    return y - np.expand_dims(theta, -1) * (x - x_mean) if np.ndim(theta) else y - theta * (x - x_mean)



def diff_and_var(control, treatment):
    """delta_hat and Var(delta_hat) (Welch) for 1-D arrays."""
    c = np.asarray(control, dtype=float)
    t = np.asarray(treatment, dtype=float)
    d = t.mean() - c.mean()
    V = c.var(ddof=1) / len(c) + t.var(ddof=1) / len(t)
    return d, V


def analyze(control, treatment, control_pre=None, treatment_pre=None, alpha=0.05,
            tau=None, looks=10):
    """Full report for one metric, computed the way a refreshing dashboard would see it.

    control/treatment are per-unit metric values in assignment order. Pre-period covariates
    enable CUPED. At each of `looks` evenly spaced interim looks we use only the data seen so
    far (including the CUPED theta), and the always-valid p-value is the running minimum of
    1/Lambda. tau defaults to 0.1 x the pooled SD at the first look and is then held fixed.
    """
    c = np.asarray(control, dtype=float)
    t = np.asarray(treatment, dtype=float)
    if len(c) < 3 or len(t) < 3:
        raise ValueError("need at least 3 units per arm")
    use_cuped = control_pre is not None and treatment_pre is not None
    if use_cuped:
        cx = np.asarray(control_pre, dtype=float)
        tx = np.asarray(treatment_pre, dtype=float)
        if len(cx) != len(c) or len(tx) != len(t):
            raise ValueError("pre-period arrays must match metric arrays")

    def at(nc, nt):
        cy, ty = c[:nc], t[:nt]
        info = {}
        if use_cuped:
            xc, xt = cx[:nc], tx[:nt]
            x_all = np.concatenate([xc, xt])
            theta = float(cuped_theta(np.concatenate([cy, ty]), x_all))
            xm = x_all.mean()
            _, V_raw = diff_and_var(cy, ty)
            cy = cy - theta * (xc - xm)
            ty = ty - theta * (xt - xm)
            _, V_adj = diff_and_var(cy, ty)
            info = {"theta": theta, "variance_reduction": float(1 - V_adj / V_raw) if V_raw > 0 else 0.0}
        d, V = diff_and_var(cy, ty)
        sd = float(np.sqrt((cy.var(ddof=1) + ty.var(ddof=1)) / 2))
        return float(d), float(V), sd, info

    p_seq = 1.0
    trace = []
    tau2 = None if tau is None else float(tau) ** 2
    d = V = None
    info = {}
    for k in range(1, looks + 1):
        nc = max(3, int(round(len(c) * k / looks)))
        nt = max(3, int(round(len(t) * k / looks)))
        d, V, sd, info = at(nc, nt)
        if tau2 is None:
            tau2 = (0.1 * sd) ** 2 if sd > 0 else 1.0
        if V <= 0:
            continue
        p_seq = min(p_seq, float(msprt_p(d, V, tau2)))
        trace.append({"look": k, "n_control": nc, "n_treatment": nt, "delta": d,
                      "p_naive": float(naive_p(d, V)), "p_always_valid": p_seq})
    if not V or V <= 0:
        raise ValueError("metric has zero variance")
    lo, hi = always_valid_ci(d, V, tau2, alpha)
    base = float(c.mean())
    out = {"n_control": int(len(c)), "n_treatment": int(len(t)), "alpha": alpha}
    if use_cuped:
        out["cuped"] = info
    out.update({
        "control_mean": base,
        "treatment_mean": float(t.mean()),
        "delta": d,
        "relative_lift": d / base if base else None,
        "se": float(np.sqrt(V)),
        "p_naive": float(naive_p(d, V)),
        "p_always_valid": p_seq,
        "always_valid_ci": [float(lo), float(hi)],
        "tau": float(np.sqrt(tau2)),
        "decision": "ship" if (p_seq < alpha and d > 0) else ("revert" if p_seq < alpha else "keep running"),
        "looks": trace,
    })
    return out
