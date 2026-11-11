"""Simulated diners. Everything in this file is synthetic.

Noise model (Thurstone): when asked "which did you like more?", a diner perceives
    d = u_new - u_existing + eps,   eps ~ N(0, sigma^2)
and answers "new" if d > 0. With tie_delta > 0 the diner answers "too close to call"
when |d| < tie_delta. Utilities are N(0, 1) per diner, so sigma is in units of the
spread of that diner's own taste.

Band choice: the diner perceives u + N(0, band_sigma^2) and picks
liked if > 0.25, disliked if < -0.67, else fine (roughly 40/35/25 percent).
"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

from ranking import engine  # noqa: E402

LIKED_T, DISLIKED_T = 0.25, -0.67


def choose(rng, u_new, u_old, sigma, tie_delta=0.0):
    d = u_new - u_old + (rng.normal(0, sigma) if sigma > 0 else 0.0)
    if tie_delta > 0 and abs(d) < tie_delta:
        return "tie"
    return "new" if d > 0 else "existing"


def pick_band(rng, u, band_sigma):
    v = u + (rng.normal(0, band_sigma) if band_sigma > 0 else 0.0)
    if v > LIKED_T:
        return "liked"
    if v < DISLIKED_T:
        return "disliked"
    return "fine"


def build_list(rng, utils, sigma, strategy="band_binary", tie_delta=0.0, band_sigma=None,
               record=None):
    """Insert items (indices into utils) in order. Returns (ordered item list best first, comparisons).

    strategies: 'binary' (one global list), 'band_binary' (sentiment band first),
    'linear' (scan from the top until the new item wins; the naive baseline).
    `record`, if given, is a list that receives (list_size_before, comparisons) per insert.
    """
    if band_sigma is None:
        band_sigma = sigma
    bands = {b: [] for b in engine.BAND_ORDER} if strategy == "band_binary" else {"all": []}
    total = 0
    for item in range(len(utils)):
        key = pick_band(rng, utils[item], band_sigma) if strategy == "band_binary" else "all"
        lst = bands[key]
        n = len(lst)
        if strategy == "linear":
            pos, comps = n, 0
            for i, other in enumerate(lst):
                comps += 1
                c = choose(rng, utils[item], utils[other], sigma, tie_delta)
                if c in ("new", "tie"):
                    pos = i
                    break
        else:
            st = engine.InsertState(n=n)
            while not st.done:
                st.answer(choose(rng, utils[item], utils[lst[st.next_index()]], sigma, tie_delta))
            pos, comps = st.final_position, st.comparisons
        lst.insert(pos, item)
        total += comps
        if record is not None:
            record.append((n, comps))
    if strategy == "band_binary":
        ordered = bands["liked"] + bands["fine"] + bands["disliked"]
    else:
        ordered = bands["all"]
    return ordered, total


def scores_from_bands(rng, utils, sigma, tie_delta=0.0):
    """Build a band-first list and return {item: 0-10 score}."""
    bands = {b: [] for b in engine.BAND_ORDER}
    for item in range(len(utils)):
        b = pick_band(rng, utils[item], sigma)
        lst = bands[b]
        st = engine.InsertState(n=len(lst))
        while not st.done:
            st.answer(choose(rng, utils[item], utils[lst[st.next_index()]], sigma, tie_delta))
        lst.insert(st.final_position, item)
    return {item: s for item, _b, s in engine.score_lists(bands)}


def kendall_vs_truth(ordered, utils):
    """Kendall tau between list order (best first) and true utility."""
    from scipy.stats import kendalltau

    rank_pos = np.empty(len(ordered))
    rank_pos[np.array(ordered)] = -np.arange(len(ordered))  # higher = better
    return float(kendalltau(rank_pos, np.asarray(utils)).statistic)
