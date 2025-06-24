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
                    logger.debug(f"Transformed file content at {clean_path}:\n{f.read()[:1000]}")
                    logs.append(f"Transformed file content at {clean_path}:\n{f.read()[:1000]}")
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

            return JsonResponse({
                'message': 'Upload + Ingestion + Transformation + Report Complete',
                'category': category,
                'valid': valid,
                'transformation_result': clean_path,
                'report_path': report_result,
                'logs': logs
            })

        except Exception as e:
            logger.error(f"Pipeline error: {e}")
            logs.append(f"Pipeline error: {str(e)}")
            return JsonResponse({'error': str(e), 'logs': logs}, status=500)

    return JsonResponse({'error': 'No file uploaded', 'logs': logs if 'logs' in locals() else []}, status=400)