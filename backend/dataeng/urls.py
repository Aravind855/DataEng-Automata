from django.urls import path
from .views import upload_and_analyze

urlpatterns = [
    path('upload/', upload_and_analyze, name='upload_and_analyze'),
]
