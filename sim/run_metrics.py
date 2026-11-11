"""Reproduce every number in results/results.json.

    python sim/run_metrics.py              # everything (needs Postgres for the latency test)
    python sim/run_metrics.py --skip-latency

All users, answers and experiment metrics are simulated (see sim/users.py). The restaurant
catalog used by the recommendation and latency sections is real NYC DOHMH data.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import platform
import sys
import time
from collections import defaultdict

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "server"))
sys.path.insert(0, os.path.dirname(__file__))

from experiments import stats  # noqa: E402
from ranking import taste  # noqa: E402
import users  # noqa: E402

SEED = 20271


# ---------------------------------------------------------------- 1. insertion
def insertion_metrics(n_users=200, list_len=200):
    rng = np.random.default_rng(SEED)
    # (a) comparisons per insert vs list size, honest user (sigma=0), global binary vs linear scan
    by_size = {"binary": defaultdict(list), "linear": defaultdict(list)}
    for strat in ("binary", "linear"):
        for _ in range(n_users):
            utils = rng.normal(0, 1, list_len)
            rec = []
            users.build_list(rng, utils, 0.0, strategy=strat, record=rec)
            for n, c in rec:
                by_size[strat][n].append(c)
    checkpoints = [10, 25, 50, 100, 199]
    curve = []
    for n in checkpoints:
        curve.append({
            "list_size": n,
            "binary_mean_comparisons": round(float(np.mean(by_size["binary"][n])), 3),
            "binary_max_comparisons": int(np.max(by_size["binary"][n])),
            "log2_n_plus_1": round(math.log2(n + 1), 3),
            "ceil_log2_n_plus_1": math.ceil(math.log2(n + 1)),
            "linear_scan_mean_comparisons": round(float(np.mean(by_size["linear"][n])), 3),
        })
    total_binary = float(np.mean([sum(np.mean(by_size["binary"][n]) for n in range(100))]))
    total_linear = float(np.mean([sum(np.mean(by_size["linear"][n]) for n in range(100))]))
    worst_ok = all(max(by_size["binary"][n]) <= math.ceil(math.log2(n + 1)) for n in range(1, list_len))

    # (b) noisy users: Kendall tau vs ground truth and comparisons per insert, 100-place lists
    noise = []
    strategies = [("linear", 0.0), ("binary", 0.0), ("band_binary", 0.0), ("band_binary", 0.1)]
    for sigma in (0.0, 0.1, 0.25, 0.5):
        row = {"sigma": sigma}
        for strat, tie in strategies:
            taus, comps = [], []
            r2 = np.random.default_rng(SEED + int(sigma * 1000))
            for _ in range(n_users):
                utils = r2.normal(0, 1, 100)
                ordered, total = users.build_list(r2, utils, sigma, strategy=strat, tie_delta=tie)
                taus.append(users.kendall_vs_truth(ordered, utils))
                comps.append(total / 100)
            name = strat + ("_tie" if tie else "")
            row[name] = {"kendall_tau": round(float(np.mean(taus)), 4),
                         "comparisons_per_insert": round(float(np.mean(comps)), 3)}
        noise.append(row)
    return {
        "setup": f"{n_users} simulated users per cell; utilities N(0,1); Thurstone choice noise sigma; "
                 "100-place lists for the noise table, 200-place lists for the size curve",
        "size_curve": curve,
        "worst_case_within_ceil_log2_all_sizes_1_to_199": worst_ok,
        "total_comparisons_to_build_100_list": {"binary": round(total_binary, 1),
                                                "linear_scan": round(total_linear, 1),
                                                "reduction_x": round(total_linear / total_binary, 2)},
        "noise_table": noise,
    }


# ---------------------------------------------------------------- 2. experiments
def simulate_metric(rng, n, lift):
    """Places ranked per diner during a 2 week test, with a 2 week pre-period covariate.

    Engagement rate lambda_i ~ Gamma(shape=1.5, scale=2) (mean 3, heavy right tail);
    pre ~ Poisson(lambda_i); post ~ Poisson(lambda_i * (1 + lift)).
    """
    lam = rng.gamma(1.5, 2.0, n)
    return rng.poisson(lam * (1 + lift)).astype(float), rng.poisson(lam).astype(float)


def experiment_metrics(n_sims=2000, per_arm=10000, looks=20, lift=0.05, alpha=0.05):
    rng = np.random.default_rng(SEED + 7)
    out = {"setup": f"{n_sims} simulated experiments per scenario, {per_arm} users per arm, {looks} evenly spaced "
                    f"looks, alpha={alpha}; metric = places ranked in 2 weeks (Gamma-Poisson), pre-period = "
                    f"prior 2 weeks; tau = 0.1 x pooled SD at the first look; CUPED theta re-estimated at "
                    f"every look from data seen so far"}

    def run(lift_value, with_cuped):
        naive_any = naive_final = seq_any = 0
        stop_n = []
        vr = []
        for _ in range(n_sims):
            yc, xc = simulate_metric(rng, per_arm, 0.0)
            yt, xt = simulate_metric(rng, per_arm, lift_value)
            r = stats.analyze(yc, yt, xc if with_cuped else None, xt if with_cuped else None,
                              alpha=alpha, looks=looks)
            ps_naive = [lk["p_naive"] for lk in r["looks"]]
            naive_any += any(p < alpha for p in ps_naive)
            naive_final += ps_naive[-1] < alpha
            hit = [lk for lk in r["looks"] if lk["p_always_valid"] < alpha]
            seq_any += bool(hit)
            stop_n.append(hit[0]["n_control"] + hit[0]["n_treatment"] if hit else 2 * per_arm)
            if with_cuped:
                vr.append(r["cuped"]["variance_reduction"])
        res = {"naive_peeking_reject_rate": naive_any / n_sims,
               "fixed_horizon_reject_rate": naive_final / n_sims,
               "msprt_reject_rate": seq_any / n_sims,
               "msprt_mean_users_at_stop": float(np.mean(stop_n))}
        if with_cuped:
            res["cuped_variance_reduction_mean"] = float(np.mean(vr))
        return res

    t0 = time.time()
    out["aa_raw"] = run(0.0, False)
    out["aa_cuped"] = run(0.0, True)
    out["ab_raw"] = run(lift, False)
    out["ab_cuped"] = run(lift, True)
    out["ab_true_relative_lift"] = lift
    # Monte Carlo standard error on a 5% rate with n_sims draws
    out["mc_se_at_5pct"] = math.sqrt(0.05 * 0.95 / n_sims)
    out["peeking_fpr_inflation_x"] = out["aa_raw"]["naive_peeking_reject_rate"] / alpha
    out["cuped_users_to_decision_reduction"] = 1 - out["ab_cuped"]["msprt_mean_users_at_stop"] / out["ab_raw"]["msprt_mean_users_at_stop"]
    # Theory check: for Gamma(k=1.5, scale=2) rates with Poisson draws, corr(pre, post) = Var(lam) / (Var(lam) + E[lam])
    # and CUPED's variance reduction should be corr^2.
    var_lam, mean_lam = 1.5 * 2.0 ** 2, 1.5 * 2.0
    out["cuped_variance_reduction_theory"] = (var_lam / (var_lam + mean_lam)) ** 2
    out["seconds"] = round(time.time() - t0, 1)
    return out


# ---------------------------------------------------------------- 3. recommendations
def load_catalog():
    with open(os.path.join(ROOT, "data", "nyc_manhattan_restaurants.csv"), newline="") as f:
        return list(csv.DictReader(f))


def recommendation_metrics(n_users=300, n_places=1500, n_clusters=6, visits=60, n_friends=20,
                           p_same_cluster=0.5, sigma=0.25, k=10):
    rng = np.random.default_rng(SEED + 11)
    catalog = load_catalog()
    idx = rng.choice(len(catalog), n_places, replace=False)
    places = [catalog[i] for i in idx]
    cuisines = sorted({p["cuisine"] for p in places})
    cid = np.array([cuisines.index(p["cuisine"]) for p in places])
    quality = rng.normal(0, 0.5, n_places)  # shared "everyone agrees" quality
    cluster_aff = rng.normal(0, 1.0, (n_clusters, len(cuisines)))  # taste clusters over real cuisines
    cluster_place = rng.normal(0, 0.7, (n_clusters, n_places))  # cluster-specific place affinity
    cluster = rng.integers(0, n_clusters, n_users)
    U = quality[None, :] + cluster_aff[cluster][:, cid] + cluster_place[cluster] + rng.normal(0, 0.5, (n_users, n_places))
    U = (U - U.mean(axis=1, keepdims=True)) / U.std(axis=1, keepdims=True)
    pop = 1.0 / np.arange(1, n_places + 1) ** 0.6  # Zipf-ish visit popularity
    pop = pop[rng.permutation(n_places)]
    pop /= pop.sum()

    lists = []
    for u in range(n_users):
        visited = rng.choice(n_places, visits, replace=False, p=pop)
        utils = U[u, visited]
        sc = users.scores_from_bands(rng, utils, sigma)
        lists.append({int(visited[i]): s for i, s in sc.items()})

    friends = []
    for u in range(n_users):
        same = [v for v in np.flatnonzero(cluster == cluster[u]) if v != u]
        other = [v for v in range(n_users) if v != u and cluster[v] != cluster[u]]
        n_same = rng.binomial(n_friends, p_same_cluster)
        fr = list(rng.choice(same, min(n_same, len(same)), replace=False)) + \
            list(rng.choice(other, n_friends - min(n_same, len(same)), replace=False))
        friends.append([int(f) for f in fr])

    # popularity baseline: Bayesian mean score over all users
    tot, cnt = defaultdict(float), defaultdict(int)
    for lst in lists:
        for p, s in lst.items():
            tot[p] += s
            cnt[p] += 1
    pop_score = {p: (tot[p] + 2 * 5.0) / (cnt[p] + 2) for p in tot}

    def evaluate(rec_fn):
        precs, pct = [], []
        for u in range(n_users):
            mine = lists[u]
            unseen = np.array([p for p in range(n_places) if p not in mine])
            thresh = np.quantile(U[u, unseen], 0.9)
            recs = rec_fn(u)[:k]
            if not recs:
                continue
            precs.append(np.mean([U[u, p] >= thresh for p in recs]))
            pct.append(np.mean([(U[u, unseen] < U[u, p]).mean() for p in recs]))
        return {"precision_at_10": round(float(np.mean(precs)), 4),
                "mean_true_percentile": round(float(np.mean(pct)), 4)}

    def rec_pop(u):
        return [p for p in sorted(pop_score, key=lambda p: -pop_score[p]) if p not in lists[u]][:k]

    def rec_friends_unweighted(u):
        num, den = defaultdict(float), defaultdict(float)
        for f in friends[u]:
            for p, s in lists[f].items():
                if p not in lists[u]:
                    num[p] += s
                    den[p] += 1
        sc = {p: (num[p] + 0.5 * 5) / (den[p] + 0.5) for p in num}
        return sorted(sc, key=lambda p: -sc[p])[:k]

    def rec_taste(u):
        return [p for p, _, _ in taste.recommend(lists[u], {f: lists[f] for f in friends[u]}, k=k)]

    sims_same, sims_diff = [], []
    for u in range(n_users):
        for f in friends[u]:
            s, _ = taste.similarity(lists[u], lists[f])
            (sims_same if cluster[f] == cluster[u] else sims_diff).append(s)

    return {
        "setup": f"{n_users} simulated diners in {n_clusters} taste clusters over {n_places} real Manhattan "
                 f"restaurants ({len(cuisines)} cuisines); {visits} visits each (Zipf popularity); lists built "
                 f"with band-first insertion at sigma={sigma}; {n_friends} friends each, {p_same_cluster:.0%} "
                 f"same-cluster in expectation; relevant = top 10% true utility among places not on the list",
        "popularity": evaluate(rec_pop),
        "friends_unweighted": evaluate(rec_friends_unweighted),
        "friends_taste_weighted": evaluate(rec_taste),
        "mean_similarity_same_cluster_friends": round(float(np.mean(sims_same)), 4),
        "mean_similarity_other_cluster_friends": round(float(np.mean(sims_diff)), 4),
        "random_precision_at_10": 0.1,
    }


# ---------------------------------------------------------------- 4. API latency
def latency_metrics(n_diners=48, places_each=60, threads=16, port=8765, workers=4):
    import subprocess
    import threading

    import requests

    env = dict(os.environ)
    server = os.path.join(ROOT, "server")
    venv_bin = os.path.dirname(sys.executable)
    subprocess.run([sys.executable, "manage.py", "migrate", "-v", "0"], cwd=server, env=env, check=True)
    subprocess.run([sys.executable, "manage.py", "load_places"], cwd=server, env=env, check=True,
                   stdout=subprocess.DEVNULL)
    subprocess.run([sys.executable, "manage.py", "shell", "-c",
                    "from ranking.models import Diner; Diner.objects.filter(handle__startswith='load-').delete()"],
                   cwd=server, env=env, check=True)
    proc = subprocess.Popen([os.path.join(venv_bin, "gunicorn"), "palate.wsgi", "-b", f"127.0.0.1:{port}",
                             "-w", str(workers), "--log-level", "warning"], cwd=server, env=env)
    base = f"http://127.0.0.1:{port}/api"
    try:
        for _ in range(100):
            try:
                requests.get(f"{base}/places/?limit=1", timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        all_places = requests.get(f"{base}/places/?limit=100&q=a").json()
        place_ids = [p["id"] for p in all_places]
        while len(place_ids) < places_each:
            raise RuntimeError("not enough places")
        lat = defaultdict(list)
        lock = threading.Lock()
        errors = []
        comps_total = [0, 0]

        def timed(name, fn):
            t = time.perf_counter()
            r = fn()
            dt = (time.perf_counter() - t) * 1000
            with lock:
                lat[name].append(dt)
            if r.status_code >= 400:
                errors.append((name, r.status_code, r.text[:200]))
            return r

        def diner_job(i):
            s = requests.Session()
            r = np.random.default_rng(SEED + 100 + i)
            did = timed("POST /diners", lambda: s.post(f"{base}/diners/", json={"handle": f"load-{i}"})).json()["id"]
            chosen = list(r.choice(place_ids, places_each, replace=False))
            utils = dict(zip(chosen, r.normal(0, 1, places_each)))
            for p in chosen:
                band = users.pick_band(r, utils[p], 0.25)
                sess = timed("POST /inserts", lambda: s.post(f"{base}/diners/{did}/inserts/",
                                                             json={"place_id": int(p), "band": band})).json()
                while sess["status"] == "open":
                    opp = sess["compare_with"]["id"]
                    c = users.choose(r, utils[p], utils[opp], 0.25)
                    sess = timed("POST /answer", lambda: s.post(f"{base}/inserts/{sess['id']}/answer/",
                                                                json={"choice": c})).json()
                with lock:
                    comps_total[0] += sess["comparisons"]
                    comps_total[1] += 1
            for _ in range(5):
                timed("GET /list", lambda: s.get(f"{base}/diners/{did}/list/"))

        t0 = time.time()
        pending = list(range(n_diners))
        def worker():
            while True:
                with lock:
                    if not pending:
                        return
                    i = pending.pop()
                diner_job(i)
        ts = [threading.Thread(target=worker) for _ in range(threads)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        wall = time.time() - t0
        res = {}
        total = 0
        for name, xs in sorted(lat.items()):
            a = np.array(xs)
            total += len(a)
            res[name] = {"n": len(a), "p50_ms": round(float(np.percentile(a, 50)), 2),
                         "p95_ms": round(float(np.percentile(a, 95)), 2),
                         "p99_ms": round(float(np.percentile(a, 99)), 2)}
        allx = np.concatenate([np.array(v) for v in lat.values()])
        return {"setup": f"gunicorn {workers} sync workers + PostgreSQL 16 on one laptop; {threads} concurrent "
                         f"client threads; {n_diners} simulated diners each ranking {places_each} places "
                         f"(band-first, sigma=0.25) then reading their list 5 times",
                "requests": total, "errors": len(errors), "error_samples": errors[:3],
                "wall_seconds": round(wall, 2), "throughput_rps": round(total / wall, 1),
                "all_requests": {"p50_ms": round(float(np.percentile(allx, 50)), 2),
                                 "p95_ms": round(float(np.percentile(allx, 95)), 2),
                                 "p99_ms": round(float(np.percentile(allx, 99)), 2)},
                "by_endpoint": res,
                "mean_comparisons_per_insert_over_http": round(comps_total[0] / comps_total[1], 3)}
    finally:
        proc.terminate()
        proc.wait(timeout=10)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-latency", action="store_true")
    ap.add_argument("--quick", action="store_true", help="smaller sims for a smoke run")
    args = ap.parse_args()
    out = {"generated_at": time.strftime("%Y-%m-%d %H:%M:%S"), "seed": SEED,
           "machine": f"{platform.system()} {platform.machine()}, Python {platform.python_version()}",
           "data_note": "Users, answers and experiment metrics are simulated. Restaurant catalog is real NYC DOHMH "
                        "inspection data (Manhattan, inspected 2024 or later)."}
    t = time.time()
    out["insertion"] = insertion_metrics(n_users=40 if args.quick else 200)
    print("insertion done", round(time.time() - t, 1), flush=True)
    out["experiments"] = experiment_metrics(n_sims=200 if args.quick else 2000)
    print("experiments done", round(time.time() - t, 1), flush=True)
    out["recommendations"] = recommendation_metrics()
    print("recs done", round(time.time() - t, 1), flush=True)
    if not args.skip_latency:
        out["api_latency"] = latency_metrics()
        print("latency done", round(time.time() - t, 1), flush=True)
    os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
    path = os.path.join(ROOT, "results", "results.json")
    if args.skip_latency and os.path.exists(path):
        prev = json.load(open(path))
        if "api_latency" in prev:
            out["api_latency"] = prev["api_latency"]
    with open(path, "w") as f:
        json.dump(out, f, indent=2)
    print(json.dumps({k: v for k, v in out.items() if k != "insertion"}, indent=1)[:4000])


if __name__ == "__main__":
    main()
