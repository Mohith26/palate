from django.db import models

from ranking.models import Diner


class Experiment(models.Model):
    key = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    treatment_share = models.FloatField(default=0.5)
    metric = models.CharField(max_length=60, default="places_ranked")
    started_at = models.DateTimeField(auto_now_add=True)


class Assignment(models.Model):
    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="assignments")
    diner = models.ForeignKey(Diner, on_delete=models.CASCADE)
    variant = models.CharField(max_length=20)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["experiment", "diner"], name="one_assignment")]


class MetricEvent(models.Model):
    """A metric observation. phase='pre' rows are the CUPED covariate (before exposure)."""

    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="events")
    diner = models.ForeignKey(Diner, on_delete=models.CASCADE)
    phase = models.CharField(max_length=4, choices=[("pre", "pre"), ("post", "post")], default="post")
    value = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["experiment", "phase", "diner"])]
