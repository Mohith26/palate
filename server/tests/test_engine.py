import random

import pytest

from ranking import engine


def insert_all(values, choose):
    """Insert values one by one into a best-first list using a chooser(new, existing) -> choice."""
    lst = []
    total = 0
    for v in values:
        st = engine.InsertState(n=len(lst))
        while not st.done:
            st.answer(choose(v, lst[st.next_index()]))
        lst.insert(st.final_position, v)
        total += st.comparisons
    return lst, total


def perfect(a, b):
    return "new" if a > b else "existing"


def test_perfect_chooser_sorts():
    vals = random.Random(1).sample(range(1000), 200)
    lst, _ = insert_all(vals, perfect)
    assert lst == sorted(vals, reverse=True)


@pytest.mark.parametrize("n", [0, 1, 2, 3, 7, 8, 100, 1000])
def test_comparisons_bounded_by_log2(n):
    rng = random.Random(n)
    for _ in range(50):
        existing = sorted(rng.sample(range(10 ** 6), n), reverse=True)
        new = rng.randrange(10 ** 6)
        st = engine.InsertState(n=n)
        while not st.done:
            st.answer(perfect(new, existing[st.next_index()]))
        assert st.comparisons <= engine.max_comparisons(n)


def test_max_comparisons_values():
    assert [engine.max_comparisons(n) for n in [0, 1, 2, 3, 4, 7, 8, 1023, 1024]] == [0, 1, 2, 2, 3, 3, 4, 10, 11]


def test_tie_stops_early_and_lands_above_opponent():
    st = engine.InsertState(n=9)
    mid = st.next_index()
    st.answer("tie")
    assert st.done and st.final_position == mid and st.comparisons == 1


def test_bad_inputs():
    st = engine.InsertState(n=3)
    with pytest.raises(ValueError):
        st.answer("maybe")
    st0 = engine.InsertState(n=0)
    assert st0.done and st0.final_position == 0
    with pytest.raises(ValueError):
        st0.answer("new")


def test_band_scores():
    assert engine.band_scores(1, "liked") == [10.0]
    s = engine.band_scores(4, "fine")
    assert s[0] == 6.6 and s == sorted(s, reverse=True) and min(s) > 3.4
    assert engine.band_scores(0, "disliked") == []


def test_score_lists_orders_bands():
    out = engine.score_lists({"disliked": ["d"], "liked": ["a", "b"], "fine": ["c"]})
    assert [x[0] for x in out] == ["a", "b", "c", "d"]
    scores = [x[2] for x in out]
    assert scores == sorted(scores, reverse=True)
