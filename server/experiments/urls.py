from django.urls import path

from . import views

urlpatterns = [
    path("", views.create_experiment),
    path("analyze/", views.analyze_raw),
    path("<slug:key>/assignment/", views.assignment),
    path("<slug:key>/events/", views.log_events),
    path("<slug:key>/report/", views.report),
]
