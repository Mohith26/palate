import pytest
from rest_framework.test import APIClient

from ranking.models import ListEntry, Place

pytestmark = pytest.mark.django_db


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def places():
    return [Place.objects.create(name=f"Spot {i}", cuisine="Pizza" if i % 2 else "Thai", zipcode="10003")
            for i in range(20)]


def make_diner(client, handle):
    return client.post("/api/diners/", {"handle": handle}, format="json").json()["id"]


def rank(client, diner, place, band, truth):
    """Insert `place` answering truthfully from the `truth` dict (higher = better)."""
    s = client.post(f"/api/diners/{diner}/inserts/", {"place_id": place.id, "band": band}, format="json").json()
    while s["status"] == "open":
        opp = s["compare_with"]["id"]
        choice = "new" if truth[place.id] > truth[opp] else "existing"
        s = client.post(f"/api/inserts/{s['id']}/answer/", {"choice": choice}, format="json").json()
    return s


def test_full_insert_flow_produces_sorted_scored_list(client, places):
    d = make_diner(client, "mo")
    truth = {p.id: (i * 7) % 20 for i, p in enumerate(places)}
    max_seen = 0
    for p in places[:12]:
        s = rank(client, d, p, "liked", truth)
        assert s["status"] == "done"
        assert s["comparisons"] <= s["max_comparisons"]
        max_seen = max(max_seen, s["comparisons"])
    body = client.get(f"/api/diners/{d}/list/").json()
    ids = [e["place"]["id"] for e in body["entries"]]
    assert ids == sorted(ids, key=lambda i: -truth[i])
    assert body["entries"][0]["score"] == 10.0
    assert [e["rank"] for e in body["entries"]] == list(range(1, 13))
    assert max_seen <= 4  # 11 items -> ceil(log2 12) = 4


def test_bands_order_and_scores(client, places):
    d = make_diner(client, "bands")
    truth = {p.id: i for i, p in enumerate(places)}
    rank(client, d, places[0], "disliked", truth)
    rank(client, d, places[1], "fine", truth)
    rank(client, d, places[2], "liked", truth)
    e = client.get(f"/api/diners/{d}/list/").json()["entries"]
    assert [x["band"] for x in e] == ["liked", "fine", "disliked"]
    assert e[0]["score"] > e[1]["score"] > e[2]["score"]


def test_tie_and_validation(client, places):
    d = make_diner(client, "tie")
    truth = {p.id: i for i, p in enumerate(places)}
    for p in places[:5]:
        rank(client, d, p, "fine", truth)
    s = client.post(f"/api/diners/{d}/inserts/", {"place_id": places[6].id, "band": "fine"}, format="json").json()
    opp = s["compare_with"]["id"]
    bad = client.post(f"/api/inserts/{s['id']}/answer/", {"choice": "meh"}, format="json")
    assert bad.status_code == 400
    s = client.post(f"/api/inserts/{s['id']}/answer/", {"choice": "tie"}, format="json").json()
    assert s["status"] == "done" and s["comparisons"] == 1
    ids = [e["place"]["id"] for e in client.get(f"/api/diners/{d}/list/").json()["entries"]]
    assert ids.index(places[6].id) + 1 == ids.index(opp)
    again = client.post(f"/api/diners/{d}/inserts/", {"place_id": places[6].id, "band": "fine"}, format="json")
    assert again.status_code == 409
    assert client.post(f"/api/diners/{d}/inserts/", {"place_id": places[7].id, "band": "great"},
                       format="json").status_code == 400


def test_new_session_cancels_open_one(client, places):
    d = make_diner(client, "cancel")
    truth = {p.id: i for i, p in enumerate(places)}
    for p in places[:4]:
        rank(client, d, p, "liked", truth)
    s1 = client.post(f"/api/diners/{d}/inserts/", {"place_id": places[10].id, "band": "liked"}, format="json").json()
    client.post(f"/api/diners/{d}/inserts/", {"place_id": places[11].id, "band": "liked"}, format="json")
    r = client.post(f"/api/inserts/{s1['id']}/answer/", {"choice": "new"}, format="json")
    assert r.status_code == 409


def test_remove_entry_compacts_positions(client, places):
    d = make_diner(client, "rm")
    truth = {p.id: i for i, p in enumerate(places)}
    for p in places[:5]:
        rank(client, d, p, "liked", truth)
    assert client.delete(f"/api/diners/{d}/list/{places[2].id}/").status_code == 204
    pos = sorted(ListEntry.objects.filter(diner_id=d).values_list("position", flat=True))
    assert pos == [0, 1, 2, 3]


def test_friend_taste_and_recommendations(client, places):
    me = make_diner(client, "me")
    twin = make_diner(client, "twin")
    truth = {p.id: i for i, p in enumerate(places)}
    for p in places[:8]:
        rank(client, me, p, "liked", truth)
    for p in places[:12]:
        rank(client, twin, p, "liked", truth)
    assert client.post(f"/api/diners/{me}/friends/", {"handle": "twin"}, format="json").status_code == 201
    t = client.get(f"/api/diners/{me}/taste/").json()
    assert t[0]["handle"] == "twin" and t[0]["similarity"] > 0.5 and t[0]["overlap"] == 8
    recs = client.get(f"/api/diners/{me}/recommendations/").json()
    rec_ids = [r["place"]["id"] for r in recs]
    assert set(rec_ids) == {p.id for p in places[8:12]}
    assert rec_ids[0] == places[11].id


def test_experiment_assignment_events_report(client, places):
    import numpy as np

    client.post("/api/experiments/", {"key": "h2h-onboarding"}, format="json")
    rng = np.random.default_rng(0)
    events = []
    variants = {}
    for i in range(300):
        d = make_diner(client, f"u{i}")
        v = client.get(f"/api/experiments/h2h-onboarding/assignment/?diner={d}").json()["variant"]
        again = client.get(f"/api/experiments/h2h-onboarding/assignment/?diner={d}").json()["variant"]
        assert v == again
        variants[d] = v
        pre = float(rng.poisson(4))
        post = pre + rng.normal(0, 1) + (2.0 if v == "treatment" else 0.0)
        events += [{"diner": d, "phase": "pre", "value": pre}, {"diner": d, "value": post}]
    assert 100 < sum(v == "treatment" for v in variants.values()) < 200
    assert client.post("/api/experiments/h2h-onboarding/events/", {"events": events}, format="json").status_code == 201
    r = client.get("/api/experiments/h2h-onboarding/report/").json()
    assert r["decision"] == "ship"
    assert r["cuped"]["variance_reduction"] > 0.5
    assert r["n_control"] + r["n_treatment"] == 300


def test_places_search(client, places):
    r = client.get("/api/places/?q=thai&limit=5").json()
    assert len(r) == 5 and all(p["cuisine"] == "Thai" for p in r)
