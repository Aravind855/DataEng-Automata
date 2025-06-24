# data_ingestion.py

import os
import pandas as pd
from datetime import datetime
from shutil import move
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import tool
from pydantic.v1 import BaseModel, Field
import logging
import re

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

RAW_DIR = "raw_data/"
ORG_DIR = "organized_data/"
LOG_DIR = "logs/"

os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(ORG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "ingestion.log")
if not os.path.exists(LOG_FILE):
    with open(LOG_FILE, "a") as f:
        pass

VALID_CATEGORIES = {'sales', 'hr', 'iot'}  # Define valid categories
SCHEMA_CONSTRAINTS = {
    'sales': ['customer_name', 'revenue', 'invoice_id', 'product', 'date'],
    'hr': ['employee_id', 'name', 'salary', 'designation', 'joining_date'],
    'iot': ['sensor_id', 'timestamp', 'value', 'location', 'device_type']
}

class ClassifyFileInput(BaseModel):
    columns: list[str] = Field(description="List of column names in the file")

@tool(args_schema=ClassifyFileInput)
def classify_file(columns: list) -> str:
    """Classifies a file into categories like sales, hr, or iot based on column names."""
    logger.debug(f"Classifying columns: {columns}")
    keywords = {
        'sales': ['revenue', 'customer', 'invoice', 'product'],
        'hr': ['employee', 'salary', 'designation', 'joining'],
        'iot': ['sensor', 'device', 'timestamp', 'location']
    }
    for category, keys in keywords.items():
        if any(key in col.lower() for col in columns for key in keys):
            logger.debug(f"Classified as {category}")
            return category
    logger.debug("Classified as uncategorized")
    return "uncategorized"

class ValidateSchemaInput(BaseModel):
    columns: list[str] = Field(description="List of column names in the file")
    category: str = Field(description="Category of the file (sales, hr, iot)")

@tool(args_schema=ValidateSchemaInput)
def validate_schema_tool(columns: list, category: str) -> bool:
    """Validates schema columns against predefined constraints for a category."""
    logger.debug(f"Validating schema for category {category}, columns: {columns}")
    required_cols = SCHEMA_CONSTRAINTS.get(category, [])
    valid = all(col in columns for col in required_cols)
    logger.debug(f"Schema validation result: {valid}")
    return valid

class LogSummaryInput(BaseModel):
    filename: str = Field(description="Name of the file")
    category: str = Field(description="Category of the file")
    valid: bool = Field(description="Whether the schema is valid")

@tool(args_schema=LogSummaryInput)
def log_summary_tool(filename: str, category: str, valid: bool):
    """Logs the ingestion summary for the file."""
    logger.debug(f"Logging summary: filename={filename}, category={category}, valid={valid}")
    entry = f"{filename} | Category: {category} | Valid: {valid} | Time: {datetime.now()}\n"
    try:
        with open(LOG_FILE, "a") as f:
            f.write(entry)
        return "Logged"
    except Exception as e:
        logger.error(f"Logging failed: {str(e)}")
        return f"Error: {str(e)}"

class MoveToCategoryInput(BaseModel):
    filepath: str = Field(description="Path to the file")
    category: str = Field(description="Category of the file")
    filename: str = Field(description="Name of the file")

@tool(args_schema=MoveToCategoryInput)
def move_to_category_tool(filepath: str, category: str, filename: str) -> str:
    """Moves the file to its category directory."""
    logger.debug(f"Attempting to move file: {filepath} to {os.path.join(ORG_DIR, category, filename)}")
    try:
        if not os.path.exists(filepath):
            logger.error(f"Source file {filepath} does not exist")
            return f"Error: Source file {filepath} does not exist"
        target_dir = os.path.join(ORG_DIR, category)
        os.makedirs(target_dir, exist_ok=True)
        target_path = os.path.join(target_dir, filename)
        move(filepath, target_path)
        logger.debug(f"Successfully moved file to: {target_path}")
        return "Moved"
    except Exception as e:
        logger.error(f"Move error: {str(e)}")
        return f"Error moving file: {str(e)}"

def ingest_file(filepath: str, filename: str):
    logger.info(f"Processing file: {filepath}")
    try:
        if filename.endswith('.csv'):
            df = pd.read_csv(filepath)
        elif filename.endswith('.json'):
            df = pd.read_json(filepath)
        elif filename.endswith('.xlsx'):
            df = pd.read_excel(filepath, engine='openpyxl')
        else:
            raise ValueError("Unsupported file format")

        columns = df.columns.tolist()
        columns_str = ", ".join(columns)

        llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            temperature=0,
            google_api_key=os.getenv("GOOGLE_API_KEY")
        )

        tools = [classify_file, validate_schema_tool, log_summary_tool, move_to_category_tool]

        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a data ingestion agent that classifies files, validates schemas, logs results, and moves files to correct folders. Return the category and schema validity as output, strictly in the format:\nCategory: <category>\nValid: <true/false>"),
            ("human", "Analyze this file for ingestion:\nFilename: {filename}\nFile path: {file_path}\nColumns: {columns}\n"
                      "Steps:\n1. Classify the file category.\n2. Validate the schema for that category.\n3. Log the results.\n4. Move the file to the appropriate folder.\n"
                      "Output format: Category: <category>\nValid: <true/false>\n{agent_scratchpad}")
        ])

        agent = create_openai_functions_agent(llm=llm, tools=tools, prompt=prompt)
        agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True, handle_parsing_errors=True, max_iterations=5)

        result = agent_executor.invoke({
            "filename": filename,
            "columns": columns_str,
            "file_path": filepath,
            "agent_scratchpad": ""
        })

        output = result.get("output", "")
        logger.debug(f"AgentExecutor raw output: {output}")

        category = "uncategorized"
        valid = False
        category_match = re.search(r"Category:\s*(\w+)", output)
        valid_match = re.search(r"Valid:\s*(true|false)", output, re.IGNORECASE)
        if category_match:
            category = category_match.group(1).strip()
            logger.debug(f"Parsed category before validation: {category}")
            # Validate and map to known category
            category = next((cat for cat in VALID_CATEGORIES if cat in category.lower()), "uncategorized")
            logger.debug(f"Validated category: {category}")
        if valid_match:
            valid = valid_match.group(1).strip().lower() == "true"
            logger.debug(f"Parsed valid: {valid}")

        if category == "uncategorized":
            raise ValueError("File could not be classified")

        log_result = log_summary_tool.invoke({"filename": filename, "category": category, "valid": valid})
        if log_result != "Logged":
            raise RuntimeError(f"Logging failed: {log_result}")

        target_path = os.path.join(ORG_DIR, category, filename)
        if not os.path.exists(target_path):
            logger.error(f"File not found at {target_path}")
            raise RuntimeError(f"File move failed: File not found at {target_path}")

        return category, valid

    except Exception as e:
        logger.error(f"Ingestion failed for {filename}: {str(e)}")
        raise