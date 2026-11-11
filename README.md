# Palate

I built Palate to answer a simple product question: how do you turn "which of these two restaurants did you like more?" into a personal ranked list, a 0 to 10 score, and recommendations from friends who actually share your taste, while asking as few questions as possible? And then, how do you tell whether a change to that flow helped, without fooling yourself by checking the dashboard every day?

It is a Django + PostgreSQL REST backend, an Angular frontend, and a small experimentation module (CUPED and mSPRT always-valid p-values) that I validated by simulation.

**Live demo (runs fully in the browser, no backend):** https://mohith26.github.io/palate/

## What it does

* **Head-to-head ranking.** You pick a sentiment band first (liked it / it was fine / didn't like it), then the app runs a binary insertion inside that band: each question halves the remaining range, so a new place lands in at most ceil(log2(n+1)) questions. A "too close to call" answer places it next to the item you were just shown and ends the flow early.
* **Rank to score.** Each band maps to a score range (liked 6.7 to 10, fine 3.4 to 6.6, didn't like 0 to 3.3) and your rank inside the band sets where you fall, so your #1 is always a 10.0 and scores stay consistent as the list grows.
* **Friend taste match.** Similarity between two people is Kendall tau over the places you both ranked, shrunk toward 0 when the overlap is small. Recommendations are similarity-weighted friend scores over places you haven't ranked.
* **Experiments.** Sticky hash bucketing, event logging, and a report endpoint that gives a naive z-test p-value, an mSPRT always-valid p-value with a confidence sequence, and a CUPED-adjusted estimate using a pre-period covariate. The report recomputes everything look by look using only the data available at that look, the way a refreshing dashboard sees it.

The restaurant catalog is real public data: 10,401 Manhattan restaurants from the NYC DOHMH restaurant inspection dataset (inspected 2024 or later). **All users, answers, friendships and experiment metrics are simulated** (models in `sim/users.py` and `sim/run_metrics.py`).

## Layout

```
server/            Django project (palate), apps: ranking, experiments
  ranking/engine.py      binary insertion + rank-to-score (pure Python, shared with the simulator)
  ranking/taste.py       Kendall tau similarity + recommendations
  experiments/stats.py   Welch z-test, CUPED, mSPRT always-valid p-values / confidence sequence
  tests/                 pytest suite (runs against PostgreSQL)
web/               Angular app (standalone components + signals); TS mirror of engine and stats
sim/               noisy-user simulator, metrics script, HTTP load test
data/              NYC DOHMH Manhattan restaurant catalog (CSV)
results/           results.json written by sim/run_metrics.py
```

## Run it

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
createdb palate_rank                      # local PostgreSQL 16; or export PALATE_DB=sqlite
cd server
../.venv/bin/python manage.py migrate
../.venv/bin/python manage.py load_places # 10,401 NYC restaurants
../.venv/bin/python -m pytest             # 33 tests
../.venv/bin/python manage.py runserver 8000

cd ../web && npm install
npx ng test --watch=false                 # 19 tests (vitest + jsdom)
npx ng serve                              # http://localhost:4200/?api=http://localhost:8000/api
```

Without `?api=` the Angular app runs in demo mode on an in-browser backend (same insertion contract, three seeded simulated friends).

Reproduce every number below (about a minute on a laptop; the latency section starts gunicorn against Postgres):

```bash
.venv/bin/python sim/run_metrics.py        # or --skip-latency without Postgres
```

## Results

From `results/results.json` (seed 20271, Apple Silicon laptop, Python 3.13).

**1. Questions per insert vs list size** (honest user, 200 simulated users, 200-place lists)

| List size n | Binary insertion, mean | Binary, worst | log2(n+1) | Linear scan from the top, mean |
|---|---|---|---|---|
| 10 | 3.55 | 4 | 3.46 | 5.81 |
| 25 | 4.75 | 5 | 4.70 | 13.82 |
| 50 | 5.71 | 6 | 5.67 | 26.33 |
| 100 | 6.74 | 7 | 6.66 | 51.40 |
| 199 | 7.71 | 8 | 7.64 | 98.52 |

Worst case stayed within ceil(log2(n+1)) at every size from 1 to 199. Building a 100-place list took 530.5 questions with binary insertion vs 2,572.6 with a linear scan (4.85x fewer).

**2. Accuracy under noisy users** (100-place lists, 200 simulated users per cell; Thurstone noise sigma in units of the user's own taste spread; Kendall tau of final list vs hidden true preference)

| sigma | Linear scan | Global binary | Band first + binary | Band first + "too close to call" |
|---|---|---|---|---|
| 0.10 | tau 0.939, 24.47 q/insert | 0.955, 5.27 | 0.955, 3.79 | 0.936, 2.65 |
| 0.25 | 0.754, 19.98 | 0.885, 5.25 | 0.888, 3.77 | 0.881, 2.97 |
| 0.50 | 0.434, 12.21 | 0.778, 5.24 | 0.780, 3.76 | 0.780, 3.23 |

At sigma 0.25, asking for the sentiment band first cuts questions per insert from 5.25 to 3.77 with no loss in tau, and adding "too close to call" brings it to 2.97 (43% fewer than global binary) for a 0.005 drop in tau. Binary insertion is also far more robust to noise than the linear scan, because one bad answer can only move an item within the current search window.

**3. Peeking, mSPRT and CUPED** (2,000 simulated experiments per row, 10,000 users per arm, 20 looks, alpha 0.05; metric = places ranked in two weeks, Gamma-Poisson; Monte Carlo SE about 0.5 points)

| Scenario | Naive z-test, stop at first p<.05 | Fixed horizon (last look only) | mSPRT always-valid | mSPRT mean users at decision |
|---|---|---|---|---|
| A/A, raw metric | **25.2%** false positives | 5.0% | **2.0%** | 19,728 |
| A/A, CUPED | 26.3% | 5.7% | 1.8% | 19,758 |
| A/B +5% lift, raw | 96.5% | 93.2% | 69.9% power | 13,620 |
| A/B +5% lift, CUPED | 99.8% | 99.5% | 95.8% power | 9,226 |

Peeking at a fixed-horizon test 20 times inflated the false-positive rate 5.04x; the mSPRT p-value kept it at 2.0%. CUPED cut variance by 44.5% on average (theory for this simulated metric: 44.4%), which raised mSPRT power from 69.9% to 95.8% and cut the mean users needed to reach a decision by 32%.

**4. Friend-taste recommendations** (300 simulated diners in 6 taste clusters over 1,500 real Manhattan restaurants and 65 real cuisines, 20 friends each with 50% from the same cluster; relevant = the user's true top 10% among places they haven't ranked)

| Method | Precision@10 | Mean true percentile of recs |
|---|---|---|
| Random | 0.100 | 0.50 (expected) |
| Popularity (Bayesian mean score) | 0.481 | 0.840 |
| Friends, unweighted | 0.525 | 0.836 |
| Friends, Kendall-tau weighted | **0.555** | **0.875** |

Mean similarity was 0.352 for same-cluster friends vs 0.055 for other-cluster friends, so the score does separate real taste matches.

**5. API latency** (gunicorn with 4 sync workers + PostgreSQL 16 on one laptop, 16 concurrent client threads, 48 simulated diners each ranking 60 places over HTTP)

| Endpoint | Requests | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|
| POST /inserts | 2,880 | 10.44 | 18.09 | 42.92 |
| POST /answer | 8,976 | 10.84 | 16.89 | 21.86 |
| GET /list | 240 | 8.50 | 13.94 | 15.35 |
| All requests | 12,144 | 10.73 | **17.08** | 31.44 |

Zero errors. 3.12 questions per insert over HTTP (band first, sigma 0.25, lists up to 60).

## Honest limits

* Everything about people is simulated: preferences, noise, friendships, and experiment metrics. The restaurant catalog is the only real data. The noise and taste-cluster models are simple on purpose and are documented in code; real users likely have position bias, fatigue and drifting taste that I did not model.
* mSPRT here plugs in the sample variance and uses tau = 0.1 x the pooled SD at the first look. That is the standard practical choice, but tau trades early-stopping speed for power on small effects and should be tuned from past experiments.
* The latency test is one laptop running client and server together, so it measures the request path and the database work, not production capacity.
* The "too close to call" option trades a little accuracy for fewer questions; under no noise it lowers tau from 1.0 to 0.95, so it is a product choice, not a free win.
* The demo site runs the TypeScript mirror of the engine in your browser; the TS and Python versions are checked against each other in the test suite.
