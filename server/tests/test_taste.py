from ranking import taste


def test_kendall_tau_extremes():
    assert taste.kendall_tau([1, 2, 3, 4], [10, 20, 30, 40]) == 1.0
    assert taste.kendall_tau([1, 2, 3, 4], [4, 3, 2, 1]) == -1.0
    assert taste.kendall_tau([1], [1]) == 0.0


def test_kendall_tau_matches_scipy():
    import numpy as np
    from scipy.stats import kendalltau

    rng = np.random.default_rng(0)
    a = rng.integers(0, 5, 30).astype(float)
    b = a + rng.normal(0, 2, 30)
    assert abs(taste.kendall_tau(list(a), list(b)) - kendalltau(a, b).statistic) < 1e-9


def test_similarity_shrinks_small_overlap():
    a = {1: 9, 2: 8, 3: 7}
    b = {1: 9.5, 2: 8.5, 3: 7.5}
    s3, n3 = taste.similarity(a, b)
    big_a = {i: 100 - i for i in range(30)}
    big_b = {i: 200 - i for i in range(30)}
    s30, n30 = taste.similarity(big_a, big_b)
    assert n3 == 3 and n30 == 30 and 0 < s3 < s30 < 1


def test_recommend_prefers_similar_friend():
    me = {1: 10, 2: 8, 3: 6, 4: 4}
    twin = {1: 9, 2: 7, 3: 5, 4: 3, 100: 9.8}
    opposite = {1: 2, 2: 4, 3: 6, 4: 8, 200: 9.9}
    recs = taste.recommend(me, {"twin": twin, "opp": opposite})
    ids = [p for p, _, _ in recs]
    assert ids == [100]  # negative-similarity friend contributes nothing
    assert all(p not in me for p in ids)
