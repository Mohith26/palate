from collections import defaultdict

from django.db import IntegrityError
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ranking.models import Diner

from . import stats
from .bucketing import bucket
from .models import Assignment, Experiment, MetricEvent


@api_view(["POST"])
def create_experiment(request):
    key = request.data.get("key")
    if not key:
        return Response({"error": "key required"}, status=400)
    exp, created = Experiment.objects.get_or_create(
        key=key, defaults={"description": request.data.get("description", ""),
                           "treatment_share": float(request.data.get("treatment_share", 0.5)),
                           "metric": request.data.get("metric", "places_ranked")})
    return Response({"id": exp.id, "key": exp.key}, status=201 if created else 200)


@api_view(["GET"])
def assignment(request, key):
    exp = get_object_or_404(Experiment, key=key)
    diner = get_object_or_404(Diner, pk=request.GET.get("diner"))
    variant = bucket(exp.key, diner.id, exp.treatment_share)
    try:
        Assignment.objects.get_or_create(experiment=exp, diner=diner, defaults={"variant": variant})
    except IntegrityError:
        pass
    return Response({"experiment": key, "diner": diner.id, "variant": variant})


@api_view(["POST"])
def log_events(request, key):
    exp = get_object_or_404(Experiment, key=key)
    rows = request.data.get("events", [])
    objs = [MetricEvent(experiment=exp, diner_id=r["diner"], phase=r.get("phase", "post"), value=float(r["value"]))
            for r in rows]
    MetricEvent.objects.bulk_create(objs, batch_size=2000)
    return Response({"logged": len(objs)}, status=201)


@api_view(["GET"])
def report(request, key):
    exp = get_object_or_404(Experiment, key=key)
    assigns = list(Assignment.objects.filter(experiment=exp).order_by("assigned_at", "id").values_list("diner_id", "variant"))
    sums = defaultdict(lambda: {"pre": 0.0, "post": 0.0})
    for row in MetricEvent.objects.filter(experiment=exp).values("diner_id", "phase").annotate(v=Sum("value")):
        sums[row["diner_id"]][row["phase"]] = row["v"]
    has_pre = MetricEvent.objects.filter(experiment=exp, phase="pre").exists()
    arms = {"control": ([], []), "treatment": ([], [])}
    for diner_id, variant in assigns:
        y, x = arms[variant]
        y.append(sums[diner_id]["post"])
        x.append(sums[diner_id]["pre"])
    alpha = float(request.GET.get("alpha", 0.05))
    tau = request.GET.get("tau")
    try:
        res = stats.analyze(arms["control"][0], arms["treatment"][0],
                            arms["control"][1] if has_pre else None,
                            arms["treatment"][1] if has_pre else None,
                            alpha=alpha, tau=float(tau) if tau else None)
    except ValueError as e:
        return Response({"error": str(e)}, status=400)
    res["experiment"] = key
    res["metric"] = exp.metric
    return Response(res)


@api_view(["POST"])
def analyze_raw(request):
    """Stateless analyzer: POST arrays, get the report back."""
    d = request.data
    try:
        res = stats.analyze(d["control"], d["treatment"], d.get("control_pre"), d.get("treatment_pre"),
                            alpha=float(d.get("alpha", 0.05)), tau=d.get("tau"))
    except (KeyError, ValueError) as e:
        return Response({"error": str(e)}, status=400)
    return Response(res)
