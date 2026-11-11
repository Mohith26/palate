"""Friend taste similarity and recommendations (pure Python)."""
from __future__ import annotations

from collections import defaultdict


def kendall_tau(a: list[float], b: list[float]) -> float:
    """Kendall tau-b between two equal-length score vectors. O(n^2), fine for list overlaps."""
    n = len(a)
    if n < 2:
        return 0.0
    conc = disc = ties_a = ties_b = 0
    for i in range(n):
        for j in range(i + 1, n):
            da = a[i] - a[j]
            db = b[i] - b[j]
            if da == 0 and db == 0:
                continue
            if da == 0:
                ties_a += 1
            elif db == 0:
                ties_b += 1
            elif (da > 0) == (db > 0):
                conc += 1
            else:
                disc += 1
    denom = ((conc + disc + ties_a) * (conc + disc + ties_b)) ** 0.5
    return (conc - disc) / denom if denom else 0.0


def similarity(mine: dict, theirs: dict, shrink: int = 5) -> tuple[float, int]:
    """Taste similarity from two {place_id: score} maps.

    Kendall tau on co-ranked places, shrunk toward 0 when the overlap is small.
    Returns (similarity, overlap).
    """
    shared = [p for p in mine if p in theirs]
    if len(shared) < 2:
        return 0.0, len(shared)
    tau = kendall_tau([mine[p] for p in shared], [theirs[p] for p in shared])
    n = len(shared)
    return tau * n / (n + shrink), n


def recommend(mine: dict, friends: dict[object, dict], k: int = 10, shrink: int = 5,
              min_sim: float = 0.0) -> list[tuple[object, float, float]]:
    """Similarity-weighted friend scores over places I have not ranked.

    Returns [(place_id, predicted_score, support_weight)] best first.
    """
    num: dict = defaultdict(float)
    den: dict = defaultdict(float)
    for _fid, theirs in friends.items():
        sim, _ = similarity(mine, theirs, shrink)
        if sim <= min_sim:
            continue
        for p, s in theirs.items():
            if p in mine:
                continue
            num[p] += sim * s
            den[p] += sim
    # Bayesian average toward a neutral 5.0 so one enthusiastic friend can't dominate.
    prior_w = 0.5
    scored = [(p, (num[p] + prior_w * 5.0) / (den[p] + prior_w), den[p]) for p in num]
    scored.sort(key=lambda t: (-t[1], -t[2]))
    return scored[:k]
