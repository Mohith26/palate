from django.db import models

BAND_CHOICES = [("liked", "I liked it"), ("fine", "It was fine"), ("disliked", "I didn't like it")]


class Place(models.Model):
    """A restaurant. Seeded from NYC DOHMH inspection records (Manhattan)."""

    camis = models.CharField(max_length=16, unique=True, null=True, blank=True)
    name = models.CharField(max_length=200)
    cuisine = models.CharField(max_length=80, db_index=True)
    zipcode = models.CharField(max_length=10, blank=True)
    lat = models.FloatField(null=True)
    lng = models.FloatField(null=True)

    def __str__(self):
        return self.name


class Diner(models.Model):
    handle = models.CharField(max_length=40, unique=True)
    friends = models.ManyToManyField("self", symmetrical=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.handle


class ListEntry(models.Model):
    """One place on a diner's ranked list. position 0 = best within its band."""

    diner = models.ForeignKey(Diner, on_delete=models.CASCADE, related_name="entries")
    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name="entries")
    band = models.CharField(max_length=10, choices=BAND_CHOICES)
    position = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["diner", "place"], name="one_entry_per_place")]
        indexes = [models.Index(fields=["diner", "band", "position"])]
        ordering = ["band", "position"]


class InsertSession(models.Model):
    """In-progress binary insertion of `place` into `diner`'s `band` list."""

    OPEN, DONE, CANCELLED = "open", "done", "cancelled"
    diner = models.ForeignKey(Diner, on_delete=models.CASCADE, related_name="sessions")
    place = models.ForeignKey(Place, on_delete=models.CASCADE)
    band = models.CharField(max_length=10, choices=BAND_CHOICES)
    n = models.PositiveIntegerField()  # band size when the session started
    lo = models.PositiveIntegerField(default=0)
    hi = models.PositiveIntegerField()
    comparisons = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, default=OPEN)
    final_position = models.PositiveIntegerField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Comparison(models.Model):
    session = models.ForeignKey(InsertSession, on_delete=models.CASCADE, related_name="answers")
    opponent = models.ForeignKey(Place, on_delete=models.CASCADE)
    choice = models.CharField(max_length=10)
    created_at = models.DateTimeField(auto_now_add=True)
