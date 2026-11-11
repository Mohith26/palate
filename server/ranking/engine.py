"""Pure ranking logic: binary insertion by head-to-head picks and rank -> score.

No Django imports here so the simulator and the API share exactly the same code.
The TypeScript mirror lives in web/src/app/core/engine.ts.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Band = Literal["liked", "fine", "disliked"]
Choice = Literal["new", "existing", "tie"]

# Score range for each sentiment band (inclusive floor, inclusive ceiling).
BANDS: dict[str, tuple[float, float]] = {
    "liked": (6.7, 10.0),
    "fine": (3.4, 6.6),
    "disliked": (0.0, 3.3),
}
BAND_ORDER = ("liked", "fine", "disliked")


@dataclass
class InsertState:
    """Search window over positions [lo, hi] inside a band list of length n.

    Position 0 is the best item. The new item will land at some index in [0, n].
    """

    n: int
    lo: int = 0
    hi: int = -1
    comparisons: int = 0
    final_position: int | None = None
    history: list[tuple[int, str]] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.hi < 0:
            self.hi = self.n
        if self.n == 0:
            self.final_position = 0

    @property
    def done(self) -> bool:
        return self.final_position is not None

    def next_index(self) -> int | None:
        """Index of the existing item to compare against, or None if placement is decided."""
        if self.done:
            return None
        return (self.lo + self.hi) // 2

    def answer(self, choice: str) -> None:
        if self.done:
            raise ValueError("insertion already finished")
        if choice not in ("new", "existing", "tie"):
            raise ValueError(f"bad choice {choice!r}")
        mid = (self.lo + self.hi) // 2
        self.comparisons += 1
        self.history.append((mid, choice))
        if choice == "tie":
            # Too close to call: sit directly above the item we compared with.
            self.final_position = mid
            return
        if choice == "new":
            self.hi = mid
        else:
            self.lo = mid + 1
        if self.lo >= self.hi:
            self.final_position = self.lo


def max_comparisons(n: int) -> int:
    """Worst case comparisons for binary insertion into n items: ceil(log2(n+1))."""
    return (n).bit_length() if n > 0 else 0


def band_scores(k: int, band: str) -> list[float]:
    """Scores for a band list of length k, best first. Top item gets the band ceiling."""
    lo, hi = BANDS[band]
    if k == 0:
        return []
    return [round(lo + (hi - lo) * (k - i) / k, 1) for i in range(k)]


def score_lists(lists: dict[str, list]) -> list[tuple[object, str, float]]:
    """Flatten band lists into (item, band, score) best first."""
    out = []
    for band in BAND_ORDER:
        items = lists.get(band, [])
        for item, s in zip(items, band_scores(len(items), band)):
            out.append((item, band, s))
    return out
