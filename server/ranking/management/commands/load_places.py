import csv
from pathlib import Path

from django.core.management.base import BaseCommand

from ranking.models import Place

DEFAULT = Path(__file__).resolve().parents[4] / "data" / "nyc_manhattan_restaurants.csv"


class Command(BaseCommand):
    help = "Load NYC DOHMH Manhattan restaurants into Place"

    def add_arguments(self, parser):
        parser.add_argument("--csv", default=str(DEFAULT))
        parser.add_argument("--limit", type=int, default=0)

    def handle(self, *args, csv_path=None, **opts):
        path = opts["csv"]
        rows = list(csv.DictReader(open(path, newline="")))
        if opts["limit"]:
            rows = rows[: opts["limit"]]
        existing = set(Place.objects.values_list("camis", flat=True))
        objs = [Place(camis=r["camis"], name=r["name"], cuisine=r["cuisine"], zipcode=r["zipcode"],
                      lat=float(r["lat"]), lng=float(r["lng"])) for r in rows if r["camis"] not in existing]
        Place.objects.bulk_create(objs, batch_size=2000)
        self.stdout.write(f"loaded {len(objs)} places ({Place.objects.count()} total)")
