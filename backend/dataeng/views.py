from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.conf import settings
import os
import pandas as pd
import logging
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import tool
from pydantic.v1 import BaseModel, Field

from .agents.data_ingestion import ingest_file
from .agents.transformation_agent import transform_file
from .agents.report_agent import run_report_agent

# Configure logging to capture messages
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Define tool input schemas
class DataIngestionToolInput(BaseModel):
    filepath: str = Field(description="Path to the file to ingest")
    filename: str = Field(description="Name of the file to ingest")

class TransformationToolInput(BaseModel):
    filename: str = Field(description="Name of the file to transform")
    category: str = Field(description="Category of the file (sales, hr, iot, etc.)")

class ReportToolInput(BaseModel):
    filename: str = Field(description="Name of the transformed CSV file to generate a report for")

# Define tools
@tool(args_schema=DataIngestionToolInput)
def data_ingestion_tool(filepath: str, filename: str) -> dict:
    """Ingests a file, classifies and logs it, returns category and schema validity."""
    logger.debug(f"data_ingestion_tool called with filepath={filepath}, filename={filename}")
    try:
        category, valid = ingest_file(filepath, filename)
        logger.debug(f"Ingestion completed: category={category}, valid={valid}")
        return {"category": category, "valid": valid, "organized_path": os.path.join("organized_data", category, filename)}
    except Exception as e:
        logger.error(f"Ingestion error: {str(e)}")
        return {"error": str(e), "category": "error", "valid": False}

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

@tool(args_schema=ReportToolInput)
def report_tool(filename: str) -> dict:
    """Generates a report for the transformed CSV file."""
    logger.debug(f"report_tool called with filename={filename}")
    try:
        result = run_report_agent(filename)
        if result is None or not os.path.exists(result):
            raise ValueError(f"Report generation failed for {filename}")
        return {"report_path": result}
    except Exception as e:
        logger.error(f"Report generation error: {str(e)}")
        return {"error": str(e)}

@csrf_exempt
def upload_and_analyze(request):
    if request.method == 'POST' and request.FILES.get('file'):
        filename = request.FILES['file'].name
        filepath = os.path.join(settings.MEDIA_ROOT, filename)
        logs = []  # Store logs here

        os.makedirs(settings.MEDIA_ROOT, exist_ok=True)

        try:
            # Save the uploaded file
            logger.info(f"Saving file to: {filepath}")
            logs.append(f"Saving file to: {filepath}")
            with open(filepath, 'wb+') as f:
                for chunk in request.FILES['file'].chunks():
                    f.write(chunk)

            if not os.path.exists(filepath):
                logger.error(f"File {filepath} was not created")
                logs.append(f"Error: File {filepath} was not created")
                return JsonResponse({'error': f'File {filepath} was not created', 'logs': logs}, status=500)

            # Setup LLM and agent
            llm = ChatGoogleGenerativeAI(
                model="gemini-2.0-flash",
                temperature=0,
                google_api_key=os.getenv("GOOGLE_API_KEY")
            )

            tools = [data_ingestion_tool, transformation_tool, report_tool]

            prompt = ChatPromptTemplate.from_messages([
                ("system", """
You are an AI-powered data processing agent. Your task is to orchestrate the complete data pipeline for an uploaded file, including ingestion, transformation, and report generation. Follow these steps strictly:
1. Ingest the file using data_ingestion_tool to classify it into a category (sales, hr, iot) and validate its schema.
2. Transform the file using transformation_tool to clean and enhance the data, saving the output to the transformed_data directory.
3. Generate a report using report_tool for the transformed file, saving it as a Markdown file.
Return the result in the format:
{
  "message": "Upload + Ingestion + Transformation + Report Complete",
  "category": "<category>",
  "valid": <true/false>,
  "transformation_result": "<clean_path>",
  "report_path": "<report_path>",
  "logs": ["<log1>", "<log2>", ...]
}
If any step fails, return an error in the format:
{
  "error": "<error message>",
  "logs": ["<log1>", "<log2>", ...]
}
Process the file step-by-step, logging each action, and ensure all tools are used in sequence. Do not skip any steps.
                """),
                ("human", """
Process this uploaded file:
Filename: {filename}
Filepath: {filepath}
Steps:
1. Ingest the file to determine its category and schema validity.
2. Transform the ingested file to clean and enhance the data.
3. Generate a report for the transformed file.
Include logs for each step in the response.
Return the result in the specified JSON format.
{agent_scratchpad}
                """)
            ])

            agent = create_openai_functions_agent(llm=llm, tools=tools, prompt=prompt)
            agent_executor = AgentExecutor(
                agent=agent,
                tools=tools,
                verbose=True,
                handle_parsing_errors=True,
                max_iterations=5
            )

            # Invoke the agent
            result = agent_executor.invoke({
                "filename": filename,
                "filepath": filepath,
                "agent_scratchpad": ""
            })

            output = result.get("output", "")
            logger.debug(f"AgentExecutor raw output: {output}")
            logs.append(f"Agent output: {output}")

            # Parse the output (expecting JSON-like string)
            try:
                import json
                result_dict = json.loads(output)
            except json.JSONDecodeError:
                logger.error(f"Failed to parse agent output as JSON: {output}")
                logs.append(f"Error: Failed to parse agent output as JSON: {output}")
                return JsonResponse({'error': 'Invalid agent output format', 'logs': logs}, status=500)

            # Add logs from the agent execution
            result_dict['logs'] = logs + result_dict.get('logs', [])

            # Validate the result
            if "error" in result_dict:
                logger.error(f"Pipeline error: {result_dict['error']}")
                return JsonResponse(result_dict, status=500)

            # Verify transformed file
            clean_path = result_dict.get("transformation_result")
            if clean_path and os.path.exists(clean_path):
                try:
                    transformed_df = pd.read_csv(clean_path)
                    if transformed_df.empty or transformed_df.columns.empty:
                        logger.error(f"Transformed file {clean_path} is invalid: Empty or missing headers")
                        logs.append(f"Error: Transformed file {clean_path} is invalid: Empty or missing headers")
                        return JsonResponse({'error': f'Transformed file {clean_path} is invalid', 'logs': logs}, status=500)
                    with open(clean_path, 'r', encoding='utf-8') as f:
                        content = f.read()[:1000]
                        logger.debug(f"Transformed file content at {clean_path}:\n{content}")
                        logs.append(f"Transformed file content at {clean_path}:\n{content}")
                except pd.errors.ParserError:
                    logger.error(f"Transformed file {clean_path} has invalid CSV format")
                    logs.append(f"Error: Transformed file {clean_path} has invalid CSV format")
                    return JsonResponse({'error': f'Transformed file {clean_path} has invalid CSV format', 'logs': logs}, status=500)
            else:
                logger.error(f"Transformed file not found at {clean_path}")
                logs.append(f"Error: Transformed file not found at {clean_path}")
                return JsonResponse({'error': f'Transformed file not found at {clean_path}', 'logs': logs}, status=500)

            # Verify report file
            report_path = result_dict.get("report_path")
            if not report_path or not os.path.exists(report_path):
                logger.error(f"Report file not found at {report_path}")
                logs.append(f"Error: Report file not found at {report_path}")
                return JsonResponse({'error': f'Report file not found at {report_path}', 'logs': logs}, status=500)

            return JsonResponse(result_dict)

        except Exception as e:
            logger.error(f"Pipeline error: {str(e)}")
            logs.append(f"Pipeline error: {str(e)}")
            return JsonResponse({'error': str(e), 'logs': logs}, status=500)

    return JsonResponse({'error': 'No file uploaded', 'logs': []}, status=400)