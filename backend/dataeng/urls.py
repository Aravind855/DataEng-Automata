from django.urls import path
from .views import *

urlpatterns = [
    path('upload/', upload_and_analyze, name='upload_and_analyze'),
    path('query_rag/', query_rag, name='query_rag'),
    path('available_files/', available_files, name='available_files'),
]