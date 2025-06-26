from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.conf import settings
import os
import pandas as pd
import logging

from langchain_core.tools import tool
from pydantic.v1 import BaseModel, Field

from .agents.data_ingestion import ingest_file
from .agents.transformation_agent import transform_file
from .agents.report_agent import run_report_agent
from .agents.rag_agent import run_rag_agent

# Configure logging to capture messages
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class DataIngestionToolInput(BaseModel):
    filepath: str = Field(description="Path to the file to ingest")
    filename: str = Field(description="Name of the file to ingest")

@tool(args_schema=DataIngestionToolInput)
def data_ingestion_tool(filepath: str, filename: str) -> dict:
    """Ingests a file, classifies and logs it, returns category and schema validity."""
    logger.debug(f"data_ingestion_tool called with filepath={filepath}, filename={filename}")
    try:
        category, valid = ingest_file(filepath, filename)
        logger.debug(f"Ingestion completed: category={category}, valid={valid}")
        return {"category": category, "valid": valid}
    except Exception as e:
        logger.error(f"Ingestion error: {str(e)}")
        return {"error": str(e), "category": "error", "valid": False}

class TransformationToolInput(BaseModel):
    filename: str = Field(description="Name of the file to transform")
    category: str = Field(description="Category of the file (sales, hr, iot, etc.)")

@tool(args_schema=TransformationToolInput)
def transformation_tool(filename: str, category: str) -> dict:
    """Applies transformation to the ingested file and saves output to clean_data."""
    logger.debug(f"transform_file called with filename={filename}, category={category}")
    try:
        result = transform_file(filename, category)
        if result is None:
            raise ValueError("Transformation failed: No output file generated")
        return {"clean_path": result}
    except Exception as e:
        logger.error(f"Transformation error: {str(e)}")
        return {"error": str(e)}

class RAGToolInput(BaseModel):
    filename: str = Field(description="Name of the CSV file to process")
    csv_data: str = Field(description="Raw CSV data as a string", default="")
    query: str = Field(description="User query to process", default="")

@tool(args_schema=RAGToolInput)
def rag_tool(filename: str, csv_data: str = "", query: str = "") -> dict:
    """Creates embeddings or processes a query using the RAG agent."""
    logger.debug(f"rag_tool called with filename={filename}, has_csv={bool(csv_data)}, query={query}")
    try:
        result = run_rag_agent(filename, csv_data, query)
        if result.startswith("Error:"):
            raise ValueError(result)
        if csv_data:
            return {"vector_db_path": result}
        else:
            return {"response": result}
    except Exception as e:
        logger.error(f"RAG error: {str(e)}")
        return {"error": str(e)}

@csrf_exempt
def upload_and_analyze(request):
    if request.method == 'POST' and request.FILES.get('file'):
        filename = request.FILES['file'].name
        filepath = os.path.join(settings.MEDIA_ROOT, filename)      
        logs = []  # Store logs here

        os.makedirs(settings.MEDIA_ROOT, exist_ok=True)

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
            ingestion_result = data_ingestion_tool.invoke({"filepath": filepath, "filename": filename})
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
            transformation_result = transformation_tool.invoke({"filename": filename, "category": category})
            logger.debug(f"Transformation result: {transformation_result}")
            logs.append(f"Transformation result: {transformation_result}")
            if "error" in transformation_result:
                logs.append(f"Transformation error: {transformation_result['error']}")
                return JsonResponse({'error': transformation_result["error"], 'logs': logs}, status=500)

            clean_path = transformation_result.get("clean_path")
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

            logger.info("Starting RAG embedding creation")
            logs.append("Starting RAG embedding creation")
            rag_result = rag_tool.invoke({"filename": os.path.basename(clean_path), "csv_data": csv_data})
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

            return JsonResponse({
                'message': 'Upload + Ingestion + Transformation + RAG Embedding + Report Complete',
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

        if not query or not filename:
            logger.error("Missing query or filename in RAG query request")
            logs.append("Error: Missing query or filename")
            return JsonResponse({'error': 'Missing query or filename', 'logs': logs}, status=400)

        try:
            logger.info(f"Processing RAG query: {query} for {filename}")
            logs.append(f"Processing RAG query: {query} for {filename}")
            rag_result = rag_tool.invoke({"filename": filename, "query": query})
            logger.debug(f"RAG query result: {rag_result}")
            logs.append(f"RAG query result: {rag_result}")

            if "error" in rag_result:
                logs.append(f"RAG query error: {rag_result['error']}")
                return JsonResponse({'error': rag_result["error"], 'logs': logs}, status=500)

            return JsonResponse({
                'message': 'Query processed successfully',
                'response': rag_result['response'],
                'logs': logs
            })
        except Exception as e:
            logger.error(f"RAG query error: {str(e)}")
            logs.append(f"RAG query error: {str(e)}")
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