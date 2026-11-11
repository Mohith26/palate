from django.urls import include, path

urlpatterns = [
    path("api/", include("ranking.urls")),
    path("api/experiments/", include("experiments.urls")),
]
