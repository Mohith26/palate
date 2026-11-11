from django.db import transaction
from django.db.models import F, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import engine, taste
from .models import Comparison, Diner, InsertSession, ListEntry, Place


def place_json(p: Place) -> dict:
    return {"id": p.id, "name": p.name, "cuisine": p.cuisine, "zipcode": p.zipcode, "lat": p.lat, "lng": p.lng}


def ranked_list(diner: Diner) -> list[dict]:
    entries = list(ListEntry.objects.filter(diner=diner).select_related("place").order_by("position"))
    by_band = {b: [e for e in entries if e.band == b] for b in engine.BAND_ORDER}
    out = []
    rank = 1
    for entry, band, score in engine.score_lists(by_band):
        out.append({"rank": rank, "band": band, "score": score, "position": entry.position,
                    "place": place_json(entry.place)})
        rank += 1
    return out


def score_map(diner_id: int) -> dict[int, float]:
    entries = ListEntry.objects.filter(diner_id=diner_id).order_by("position").values_list("place_id", "band")
    by_band: dict[str, list[int]] = {b: [] for b in engine.BAND_ORDER}
    for pid, band in entries:
        by_band[band].append(pid)
    return {pid: s for pid, _b, s in engine.score_lists(by_band)}


def session_json(s: InsertSession) -> dict:
    data = {"id": s.id, "place": place_json(s.place), "band": s.band, "status": s.status,
            "comparisons": s.comparisons, "band_size": s.n,
            "max_comparisons": engine.max_comparisons(s.n), "compare_with": None, "final_position": s.final_position}
    if s.status == InsertSession.OPEN:
        mid = (s.lo + s.hi) // 2
        opp = (ListEntry.objects.filter(diner_id=s.diner_id, band=s.band, position=mid)
               .select_related("place").first())
        data["compare_with"] = place_json(opp.place) if opp else None
    return data


def _finish(s: InsertSession, position: int) -> None:
    """Shift the band down by one at `position` and write the new entry (caller holds the lock)."""
    ListEntry.objects.filter(diner_id=s.diner_id, band=s.band, position__gte=position).update(
        position=F("position") + 1)
    ListEntry.objects.create(diner_id=s.diner_id, place_id=s.place_id, band=s.band, position=position)
    s.final_position = position
    s.status = InsertSession.DONE


@api_view(["GET"])
def places(request):
    q = request.GET.get("q", "").strip()
    qs = Place.objects.all()
    if q:
        qs = qs.filter(Q(name__icontains=q) | Q(cuisine__icontains=q))
    limit = min(int(request.GET.get("limit", 20)), 100)
    return Response([place_json(p) for p in qs.order_by("name")[:limit]])


@api_view(["POST"])
def diners(request):
    handle = (request.data.get("handle") or "").strip()
    if not handle:
        return Response({"error": "handle required"}, status=400)
    d, created = Diner.objects.get_or_create(handle=handle)
    return Response({"id": d.id, "handle": d.handle}, status=201 if created else 200)


@api_view(["GET"])
def diner_list(request, diner_id):
    d = get_object_or_404(Diner, pk=diner_id)
    return Response({"diner": {"id": d.id, "handle": d.handle}, "entries": ranked_list(d)})


@api_view(["DELETE"])
def remove_entry(request, diner_id, place_id):
    with transaction.atomic():
        d = Diner.objects.select_for_update().get(pk=diner_id)
        e = get_object_or_404(ListEntry, diner=d, place_id=place_id)
        band, pos = e.band, e.position
        e.delete()
        ListEntry.objects.filter(diner=d, band=band, position__gt=pos).update(position=F("position") - 1)
    return Response(status=204)


@api_view(["POST"])
def start_insert(request, diner_id):
    place_id = request.data.get("place_id")
    band = request.data.get("band")
    if band not in engine.BANDS:
        return Response({"error": "band must be liked, fine or disliked"}, status=400)
    place = get_object_or_404(Place, pk=place_id)
    with transaction.atomic():
        d = get_object_or_404(Diner.objects.select_for_update(), pk=diner_id)
        if ListEntry.objects.filter(diner=d, place=place).exists():
            return Response({"error": "already on your list"}, status=409)
        # One open session per diner keeps positions consistent while we search.
        InsertSession.objects.filter(diner=d, status=InsertSession.OPEN).update(status=InsertSession.CANCELLED)
        n = ListEntry.objects.filter(diner=d, band=band).count()
        s = InsertSession.objects.create(diner=d, place=place, band=band, n=n, lo=0, hi=n)
        if n == 0:
            _finish(s, 0)
            s.save()
    return Response(session_json(s), status=201)


@api_view(["POST"])
def answer(request, session_id):
    choice = request.data.get("choice")
    if choice not in ("new", "existing", "tie"):
        return Response({"error": "choice must be new, existing or tie"}, status=400)
    with transaction.atomic():
        s = get_object_or_404(InsertSession.objects.select_related("place"), pk=session_id)
        Diner.objects.select_for_update().get(pk=s.diner_id)
        s.refresh_from_db()
        if s.status != InsertSession.OPEN:
            return Response({"error": f"session is {s.status}"}, status=409)
        state = engine.InsertState(n=s.n, lo=s.lo, hi=s.hi, comparisons=s.comparisons)
        mid = state.next_index()
        opp = ListEntry.objects.get(diner_id=s.diner_id, band=s.band, position=mid)
        state.answer(choice)
        Comparison.objects.create(session=s, opponent_id=opp.place_id, choice=choice)
        s.lo, s.hi, s.comparisons = state.lo, state.hi, state.comparisons
        if state.done:
            _finish(s, state.final_position)
        s.save()
    return Response(session_json(s))


@api_view(["POST"])
def add_friend(request, diner_id):
    d = get_object_or_404(Diner, pk=diner_id)
    other = get_object_or_404(Diner, handle=request.data.get("handle"))
    if other.id == d.id:
        return Response({"error": "cannot friend yourself"}, status=400)
    d.friends.add(other)
    return Response({"ok": True}, status=201)


@api_view(["GET"])
def friends_taste(request, diner_id):
    d = get_object_or_404(Diner, pk=diner_id)
    mine = score_map(d.id)
    out = []
    for f in d.friends.all():
        sim, overlap = taste.similarity(mine, score_map(f.id))
        out.append({"id": f.id, "handle": f.handle, "similarity": round(sim, 3), "overlap": overlap})
    out.sort(key=lambda r: -r["similarity"])
    return Response(out)


@api_view(["GET"])
def recommendations(request, diner_id):
    d = get_object_or_404(Diner, pk=diner_id)
    mine = score_map(d.id)
    friends = {f.id: score_map(f.id) for f in d.friends.all()}
    recs = taste.recommend(mine, friends, k=int(request.GET.get("k", 10)))
    places_by_id = Place.objects.in_bulk([p for p, _, _ in recs])
    return Response([{"place": place_json(places_by_id[p]), "predicted_score": round(s, 2),
                      "support": round(w, 3)} for p, s, w in recs])
