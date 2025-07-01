from django.urls import path
from .views import *

urlpatterns = [
    path('upload/', upload_and_analyze, name='upload_and_analyze'),
    path('query_rag/', query_rag, name='query_rag'),
    path('available_files/', available_files, name='available_files'),
    path('save_schema/', save_schema, name='save_schema'),
    path('list_databases/', list_databases, name='list_databases'),
    path('list_collections/',list_collections, name='list_collections'),
    path('list_schemas/', list_schemas, name='list_schemas'),
    path('delete_schema/', delete_schema, name='delete_schema'),
    path('get_schema/', get_schema, name='get_schema'),
    path('get_logs/', get_logs, name='get_logs'),
    path('download_pdf/', download_pdf, name='download_pdf'),
]