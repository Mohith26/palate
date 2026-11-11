from django.urls import path

from . import views

urlpatterns = [
    path("places/", views.places),
    path("diners/", views.diners),
    path("diners/<int:diner_id>/list/", views.diner_list),
    path("diners/<int:diner_id>/list/<int:place_id>/", views.remove_entry),
    path("diners/<int:diner_id>/inserts/", views.start_insert),
    path("inserts/<int:session_id>/answer/", views.answer),
    path("diners/<int:diner_id>/friends/", views.add_friend),
    path("diners/<int:diner_id>/taste/", views.friends_taste),
    path("diners/<int:diner_id>/recommendations/", views.recommendations),
]
