# Palate: spec

## Problem
Star ratings are a bad way to remember how much you liked a restaurant. People inflate them, they drift
over time, and a 4 star dinner in March means something different from a 4 star dinner in October.
Asking "which of these two did you like more?" is easier and more consistent, but a naive pairwise flow
asks too many questions. The product problem is: place a new restaurant into someone's personal ranked
list with as few head-to-head questions as possible, turn that rank into a stable 0 to 10 score, and use
the resulting lists to find friends whose taste actually matches yours.

The second problem is measuring whether any of this helps. A consumer app ships features behind A/B tests
and the team looks at dashboards every day. Looking at a fixed-horizon t-test every day ("peeking")
inflates false positives badly, and high-variance engagement metrics make tests slow.

## Why it matters to Beli
The posting asks for Django, PostgreSQL and Angular, JS/TS plus Python, statistics, and A/B tests that
measure feature impact. Ranked lists built from head-to-head picks are the core loop of a restaurant
ranking app. This project builds that loop end to end and the experimentation tooling to evaluate it.

## Design
* **Backend**: Django 5 + Django REST Framework on PostgreSQL 16 (local Homebrew server; tests run on the
  same Postgres). Apps:
  * `ranking`: places (real NYC DOHMH restaurant records, Manhattan), diners, ranked list entries,
    insertion sessions, comparisons, friendships, recommendations.
  * `experiments`: deterministic hash bucketing, event logging, and a report endpoint that runs the stats.
* **Insertion engine** (pure Python, mirrored in TypeScript): the diner first picks a sentiment band
  (liked it / it was fine / didn't like it), then binary insertion runs inside that band only. A
  "too close to call" answer places the new item next to the one it was compared against and ends early.
  Score = band floor + (band width) x rank percentile inside the band, so the top of "liked" is 10.0.
* **Friend taste**: similarity = Kendall tau on co-ranked places, shrunk by overlap n/(n+k). Recommendations
  = similarity-weighted friend scores over places you haven't ranked.
* **Stats** (`experiments/stats.py`, numpy/scipy only): Welch z-test, CUPED (theta = cov(X,Y)/var(X) on a
  pre-period covariate), and mSPRT with a normal mixing prior giving always-valid p-values
  (Johari, Pekelis, Walsh 2017).
* **Frontend**: Angular (standalone components, signals). Your ranked list with scores, a head-to-head
  "which did you like more?" card flow, friend recommendations, and an experiment report view.

## Metrics (all produced by `python -m sim.run_metrics` into `results/results.json`)
1. **Comparisons per insert vs list size**, versus ceil(log2(n+1)) and versus a linear-scan baseline;
   plus **Kendall tau vs ground truth** under simulated noisy users (Thurstone choice noise), for
   global binary insertion, band-first insertion, and band-first with "too close to call".
2. **Peeking false-positive rate** over 2,000 simulated A/A tests with 20 interim looks: naive z-test at
   every look vs mSPRT. Plus **CUPED variance reduction** and the sample size needed to reach a decision
   in A/B tests with a true effect, with and without CUPED.
3. **Friend-taste recommendation quality** (precision@10 against each simulated user's true top places)
   vs a popularity baseline and unweighted friends; and **API p95 latency** for the insert/answer
   endpoints under a concurrent load test against gunicorn + Postgres.

## Data honesty
The restaurant catalog is real public data (NYC DOHMH inspection results, Manhattan, inspected 2024+).
Every user, preference, comparison answer, and experiment metric is simulated. The noise models are
documented in `sim/` and in the README.
