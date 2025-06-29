from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.conf import settings
import os
import pandas as pd
import logging
from pymongo import MongoClient
from .agents.data_ingestion import ingest_file
from .agents.transformation_agent import transform_file
from .agents.report_agent import run_report_agent
from .agents.rag_agent import run_rag_agent
from .agents.query_agent import process_query
import json

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def get_mongo_client():
    """Initialize MongoDB client from environment variable."""
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        logger.error("MONGO_URI not set in environment variables")
        raise ValueError("MONGO_URI not set")
    return MongoClient(mongo_uri)

@csrf_exempt
def list_databases(request):
    if request.method == 'GET':
        try:
            client = get_mongo_client()
            databases = client.list_database_names()
            client.close()
            system_dbs = ['admin', 'local', 'config']
            databases = [db for db in databases if db not in system_dbs]
            logger.info(f"Retrieved database list: {databases}")
            return JsonResponse({'databases': databases}, status=200)
        except Exception as e:
            logger.error(f"Error listing databases: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)

@csrf_exempt
def list_collections(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            db_name = data.get('db_name')
            if not db_name:
                logger.error("Missing db_name")
                return JsonResponse({'error': 'Missing db_name'}, status=400)

            client = get_mongo_client()
            db = client[db_name]
            collections = db.list_collection_names()
            client.close()
            collections = [col for col in collections if col != 'schemas']
            logger.info(f"Retrieved collections for {db_name}: {collections}")
            return JsonResponse({'collections': collections}, status=200)
        except Exception as e:
            logger.error(f"Error listing collections for {db_name}: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)

@csrf_exempt
def list_schemas(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            db_name = data.get('db_name')
            if not db_name:
                logger.error("Missing db_name")
                return JsonResponse({'error': 'Missing db_name'}, status=400)

            client = get_mongo_client()
            db = client[db_name]
            schemas_collection = db['schemas']
            schemas = list(schemas_collection.find({}, {'_id': 0, 'category': 1, 'columns': 1}))
            client.close()
            logger.info(f"Retrieved schemas for {db_name}: {schemas}")
            return JsonResponse({'schemas': schemas}, status=200)
        except Exception as e:
            logger.error(f"Error listing schemas for {db_name}: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)

@csrf_exempt
def get_schema(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            db_name = data.get('db_name')
            category = data.get('category')
            if not db_name or not category:
                logger.error("Missing db_name or category")
                return JsonResponse({'error': 'Missing db_name or category'}, status=400)

            client = get_mongo_client()
            db = client[db_name]
            schemas_collection = db['schemas']
            schema_doc = schemas_collection.find_one({"category": category})
            client.close()
            if not schema_doc or "columns" not in schema_doc:
                logger.info(f"No schema found for {db_name}.{category}")
                return JsonResponse({'columns': []}, status=200)
            logger.info(f"Retrieved schema for {db_name}.{category}: {schema_doc['columns']}")
            return JsonResponse({'columns': schema_doc['columns']}, status=200)
        except Exception as e:
            logger.error(f"Error fetching schema for {db_name}.{category}: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)

@csrf_exempt
def save_schema(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            db_name = data.get('db_name')
            category = data.get('category')
            columns_raw = data.get('columns', [])

            if not isinstance(columns_raw, list):
                logger.error("Columns should be a list")
                return JsonResponse({'error': 'Columns should be a list'}, status=400)

            columns = [col.strip() for col in columns_raw if col.strip()]

            if not db_name or not category or not columns:
                logger.error("Missing required fields: db_name, category, or columns")
                return JsonResponse({'error': 'Missing required fields'}, status=400)

            client = get_mongo_client()
            db = client[db_name]
            schemas_collection = db['schemas']
            schemas_collection.update_one(
                {'category': category},
                {'$set': {'columns': columns}},
                upsert=True
            )
            client.close()

            logger.info(f"Saved schema for {db_name}.{category}: {columns}")
            return JsonResponse({'message': 'Schema saved successfully'})
        except Exception as e:
            logger.error(f"Error saving schema: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)
    
    return JsonResponse({'error': 'Invalid request method'}, status=400)

@csrf_exempt
def delete_schema(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            db_name = data.get('db_name')
            category = data.get('category')
            if not db_name or not category:
                logger.error("Missing db_name or category")
                return JsonResponse({'error': 'Missing db_name or category'}, status=400)

            client = get_mongo_client()
            db = client[db_name]
            schemas_collection = db['schemas']
            result = schemas_collection.delete_one({"category": category})
            client.close()
            if result.deleted_count == 0:
                logger.info(f"No schema found to delete for {db_name}.{category}")
                return JsonResponse({'message': 'No schema found to delete'}, status=200)
            logger.info(f"Deleted schema for {db_name}.{category}")
            return JsonResponse({'message': 'Schema deleted successfully'}, status=200)
        except Exception as e:
            logger.error(f"Error deleting schema for {db_name}.{category}: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)

@csrf_exempt
def get_logs(request):
    if request.method == 'GET':
        try:
            log_file = os.path.join('logs', 'ingestion.log')
            if not os.path.exists(log_file):
                logger.info(f"Log file {log_file} not found")
                return JsonResponse({'logs': 'No logs available'}, status=200)
            
            with open(log_file, 'r', encoding='utf-8') as f:
                logs = f.read()
            
            logger.info(f"Retrieved logs from {log_file}")
            return JsonResponse({'logs': logs}, status=200)
        except Exception as e:
            logger.error(f"Error reading logs: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)

@csrf_exempt
def upload_and_analyze(request):
    if request.method == 'POST' and request.FILES.get('file'):
        filename = request.FILES['file'].name
        db_name = request.POST.get('db_name')
        filepath = os.path.join(settings.MEDIA_ROOT, filename)
        logs = []

        os.makedirs(settings.MEDIA_ROOT, exist_ok=True)

        if not db_name:
            logger.error("Missing db_name")
            logs.append("Error: Missing db_name")
            return JsonResponse({'error': 'Missing db_name', 'logs': logs}, status=400)

        try:
            logger.info(f"Saving file to: {filepath}")
            logs.append(f"Saving file to: {filepath}")
            with open(filepath, 'wb+') as f:
                for chunk in request.FILES['file'].chunks():
                    f.write(chunk)

            if not os.path.exists(filepath):
                logger.error(f"File {filepath} was not created")
                logs.append(f"Error: File {filepath} was not created")
                return JsonResponse({'error': f'File {filepath} was not created', 'logs': logs}, status=500)

            logger.info("Starting data ingestion")
            logs.append("Starting data ingestion")
            ingestion_result = ingest_file(filepath, filename, db_name)
            logger.debug(f"Ingestion result: {ingestion_result}")
            logs.append(f"Ingestion result: {ingestion_result}")
            if "error" in ingestion_result:
                logs.append(f"Ingestion error: {ingestion_result['error']}")
                return JsonResponse({'error': ingestion_result["error"], 'logs': logs}, status=500)

            category = ingestion_result["category"]
            valid = ingestion_result["valid"]

            organized_path = os.path.join("organized_data", category, filename)
            if not os.path.exists(organized_path):
                logger.error(f"File not found at {organized_path} after ingestion")
                logs.append(f"Error: File not found at {organized_path} after ingestion")
                return JsonResponse({'error': f'File not found at {organized_path} after ingestion', 'logs': logs}, status=500)

            logger.info("Starting transformation")
            logs.append("Starting transformation")
            transformation_result = transform_file(filename, category, db_name)  # Pass db_name
            logger.debug(f"Transformation result: {transformation_result}")
            logs.append(f"Transformation result: {transformation_result}")
            if not transformation_result:
                logs.append("Transformation error: No output file generated")
                return JsonResponse({'error': 'Transformation failed: No output file generated', 'logs': logs}, status=500)

            clean_path = transformation_result
            if not clean_path or not os.path.exists(clean_path):
                logger.error(f"Transformed file not found at {clean_path}")
                logs.append(f"Error: Transformed file not found at {clean_path}")
                return JsonResponse({'error': f'Transformed file not found at {clean_path}', 'logs': logs}, status=500)

            try:
                transformed_df = pd.read_csv(clean_path)
                if transformed_df.empty or transformed_df.columns.empty:
                    logger.error(f"Transformed file {clean_path} is invalid: Empty or missing headers")
                    logs.append(f"Error: Transformed file {clean_path} is invalid: Empty or missing headers")
                    return JsonResponse({'error': f'Transformed file {clean_path} is invalid', 'logs': logs}, status=500)
                with open(clean_path, 'r', encoding='utf-8') as f:
                    csv_data = f.read()
                    logger.debug(f"Transformed file content at {clean_path}:\n{csv_data[:1000]}")
                    logs.append(f"Transformed file content at {clean_path}:\n{csv_data[:1000]}")
                import time
                time.sleep(0.1)
            except pd.errors.ParserError:
                logger.error(f"Transformed file {clean_path} has invalid CSV format")
                logs.append(f"Error: Transformed file {clean_path} has invalid CSV format")
                return JsonResponse({'error': f'Transformed file {clean_path} has invalid CSV format', 'logs': logs}, status=500)

            logger.info("Starting report generation")
            logs.append("Starting report generation")
            try:
                report_result = run_report_agent(os.path.basename(clean_path))
                if report_result is None or not os.path.exists(report_result):
                    logger.error(f"Report generation failed for {clean_path}")
                    logs.append(f"Error: Report generation failed for {clean_path}")
                    return JsonResponse({'error': f'Report generation failed for {clean_path}', 'logs': logs}, status=500)
                logger.debug(f"Report generated: {report_result}")
                logs.append(f"Report generated: {report_result}")
            except Exception as e:
                logger.error(f"Report generation error: {str(e)}")
                logs.append(f"Report generation error: {str(e)}")
                return JsonResponse({'error': f'Report generation failed: {str(e)}', 'logs': logs}, status=500)

            logger.info("Starting RAG embedding creation")
            logs.append("Starting RAG embedding creation")
            rag_result = run_rag_agent(os.path.basename(clean_path), csv_data)
            logger.debug(f"RAG embedding result: {rag_result}")
            logs.append(f"RAG embedding result: {rag_result}")
            if "error" in rag_result:
                logs.append(f"RAG embedding error: {rag_result['error']}")
                return JsonResponse({'error': rag_result["error"], 'logs': logs}, status=500)

            vector_db_path = rag_result.get("vector_db_path")
            if not vector_db_path or not os.path.exists(vector_db_path):
                logger.error(f"Vector DB not found at {vector_db_path}")
                logs.append(f"Error: Vector DB not found at {vector_db_path}")
                return JsonResponse({'error': f'Vector DB not found at {vector_db_path}', 'logs': logs}, status=500)

            return JsonResponse({
                'message': 'Upload + Ingestion + Transformation + Report + RAG Embedding Complete',
                'category': category,
                'valid': valid,
                'transformation_result': clean_path,
                'vector_db_path': vector_db_path,
                'report_path': report_result,
                'logs': logs
            })

        except Exception as e:
            logger.error(f"Pipeline error: {e}")
            logs.append(f"Pipeline error: {str(e)}")
            return JsonResponse({'error': str(e), 'logs': logs}, status=500)

    return JsonResponse({'error': 'No file uploaded', 'logs': logs if 'logs' in locals() else []}, status=400)

@csrf_exempt
def query_rag(request):
    if request.method == 'POST':
        query = request.POST.get('query')
        filename = request.POST.get('filename')
        logs = []

        logger.debug(f"Received query: '{query}', filename: '{filename}'")

        if not query or not filename:
            logger.error("Missing query or filename in RAG query request")
            logs.append("Error: Missing query or filename")
            return JsonResponse({'error': 'Missing query or filename', 'logs': logs}, status=400)

        try:
            logger.info(f"Processing RAG query: {query} for {filename}")
            logs.append(f"Processing RAG query: {query} for {filename}")
            response = process_query(query, filename)
            logger.debug(f"Query response: {response}")
            logs.append(f"Query response: {response}")

            if response.startswith("Error:"):
                logs.append(f"Query error: {response}")
                return JsonResponse({'error': response, 'logs': logs}, status=500)

            return JsonResponse({
                'message': 'Query processed successfully',
                'response': response,
                'logs': logs
            })
        except Exception as e:
            logger.error(f"Query error: {str(e)}")
            logs.append(f"Query error: {str(e)}")
            return JsonResponse({'error': str(e), 'logs': logs}, status=500)

    return JsonResponse({'error': 'Invalid request method', 'logs': []}, status=400)

@csrf_exempt
def available_files(request):
    if request.method == 'GET':
        try:
            vector_db_dir = "vector_db"
            files = [f for f in os.listdir(vector_db_dir) if f.endswith('_index.faiss')]
            files = [f.replace('_index.faiss', '.csv') for f in files]
            return JsonResponse({'files': files}, status=200)
        except Exception as e:
            logger.error(f"Error fetching available files: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid request method'}, status=400)