import os
import pandas as pd
import logging
import io
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.llms import Ollama
from langchain_core.tools import tool
from pydantic.v1 import BaseModel, Field
import time

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Directory paths
ORG_DIR = os.path.abspath("organized_data")
CLEAN_DIR = os.path.abspath("transformed_datas")
os.makedirs(CLEAN_DIR, exist_ok=True)

# Schema constraints for different categories
SCHEMA_CONSTRAINTS = {
    'sales': ['customer_name', 'revenue', 'invoice_id', 'product', 'date', 'year', 'month'],
    'hr': ['employee_id', 'name', 'salary', 'designation', 'joining_date', 'years_of_service', 'month'],
    'iot': ['sensor_id', 'timestamp', 'value', 'location', 'device_type', 'year', 'hour']
}

class AnalyzeAndTransformInput(BaseModel):
    filename: str = Field(description="The name of the file being transformed")
    category: str = Field(description="The category of the data")
    csv_data: str = Field(description="The raw CSV data to transform")

@tool(args_schema=AnalyzeAndTransformInput)
def analyze_and_transform(filename: str, category: str, csv_data: str) -> str:
    """
    Transforms the raw CSV data into a cleaned dataset with added features.
    Returns the transformed CSV string with exactly 7 columns based on the category.
    """
    logger.debug(f"Processing transformation for {filename} in category {category}")
    try:
        # Read CSV data
        df = pd.read_csv(io.StringIO(csv_data))
        if df.empty:
            logger.error(f"Empty dataset for {filename}")
            return f"Error: Empty dataset for {filename}"

        expected_cols = SCHEMA_CONSTRAINTS.get(category, SCHEMA_CONSTRAINTS['sales'])
        
        # 1. Handle Missing Values
        for col in df.columns:
            if df[col].isnull().any():
                if pd.api.types.is_numeric_dtype(df[col]):
                    df[col] = df[col].fillna(df[col].mean())
                else:
                    df[col] = df[col].fillna("Unknown")
        
        # 2. Convert Data Types
        if category == 'sales':
            if 'date' in df.columns:
                df['date'] = pd.to_datetime(df['date'], errors='coerce')
            if 'revenue' in df.columns:
                df['revenue'] = pd.to_numeric(df['revenue'], errors='coerce')
            for col in ['customer_name', 'product']:
                if col in df.columns:
                    df[col] = df[col].astype(str)
        elif category == 'hr':
            if 'joining_date' in df.columns:
                df['joining_date'] = pd.to_datetime(df['joining_date'], errors='coerce')
            if 'salary' in df.columns:
                df['salary'] = pd.to_numeric(df['salary'], errors='coerce')
            for col in ['name', 'designation']:
                if col in df.columns:
                    df[col] = df[col].astype(str)
        elif category == 'iot':
            if 'timestamp' in df.columns:
                df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
            if 'value' in df.columns:
                df['value'] = pd.to_numeric(df['value'], errors='coerce')
            for col in ['location', 'device_type']:
                if col in df.columns:
                    df[col] = df[col].astype(str)

        # 3. Feature Engineering
        if category == 'sales':
            if 'date' in df.columns:
                df['year'] = df['date'].dt.year
                df['month'] = df['date'].dt.month
        elif category == 'hr':
            if 'joining_date' in df.columns:
                df['years_of_service'] = (pd.to_datetime('now') - df['joining_date']).dt.days // 365
                df['month'] = df['joining_date'].dt.month
        elif category == 'iot':
            if 'timestamp' in df.columns:
                df['year'] = df['timestamp'].dt.year
                df['hour'] = df['timestamp'].dt.hour

        # 4. Remove duplicate rows
        df.drop_duplicates(inplace=True)

        # 5. Validate and select expected columns
        if not all(col in df.columns for col in expected_cols):
            missing_cols = [col for col in expected_cols if col not in df.columns]
            logger.error(f"Missing required columns in {filename}: {missing_cols}")
            return f"Error: Missing required columns: {missing_cols}"

        df = df[expected_cols]

        # 6. Convert to CSV
        csv_output = df.to_csv(index=False, encoding='utf-8', lineterminator='\n')
        logger.debug(f"Transformed CSV data (first 1000 chars):\n{csv_output[:1000]}")

        # 7. Validate row column counts
        csv_lines = csv_output.strip().split('\n')
        header = csv_lines[0].split(',')
        if len(header) != 7:
            logger.error(f"Header has {len(header)} columns, expected 7: {header}")
            return f"Error: Header has {len(header)} columns, expected 7"

        for i, line in enumerate(csv_lines[1:], start=1):
            fields = line.split(',')
            if len(fields) != 7:
                logger.error(f"Line {i + 1} has {len(fields)} fields, expected 7: {line}")
                return f"Error: Line {i + 1} has {len(fields)} columns, expected 7"

        return csv_output

    except Exception as e:
        logger.error(f"Error during transformation for {filename}: {str(e)}")
        return f"Error: {str(e)}"

def transform_file(filename: str, category: str) -> str:
    """
    Orchestrates the transformation of a file from the organized_data folder.
    Saves the transformed data to a .txt file and returns the path or None if transformation fails.
    """
    logger.info(f"🔁 Starting transformation for {filename} in category {category}")
    file_path = os.path.join(ORG_DIR, category, filename)

    # Load dataset
    try:
        if filename.endswith('.csv'):
            df = pd.read_csv(file_path)
        elif filename.endswith('.json'):
            df = pd.read_json(file_path)
        elif filename.endswith('.xlsx'):
            df = pd.read_excel(file_path, engine='openpyxl')
        else:
            logger.error(f"Unsupported file type for {filename}")
            return None
        logger.debug(f"Raw DataFrame from {file_path}:\n{df.head().to_string()}")
    except Exception as e:
        logger.error(f"Failed to load file {file_path}: {str(e)}")
        return None

    # Prepare inputs
    csv_string = df.to_csv(index=False)
    if not csv_string or csv_string.strip() == "":
        logger.error(f"Empty CSV data generated for {file_path}")
        return None

    # Directly invoke analyze_and_transform to ensure reliable output
    output = analyze_and_transform.invoke({"filename": filename, "category": category, "csv_data": csv_string})
    logger.debug(f"Tool output for {filename}:\n{output[:1000]}")

    if output.startswith("Error:"):
        logger.error(f"Transformation failed for {filename}: {output}")
        return None

    # Validate and save output as .txt
    try:
        df_transformed = pd.read_csv(io.StringIO(output))
        expected_cols = SCHEMA_CONSTRAINTS.get(category, SCHEMA_CONSTRAINTS['sales'])
        if df_transformed.empty or list(df_transformed.columns) != expected_cols:
            logger.error(f"Invalid transformed data for {filename}: Incorrect columns or empty")
            return None

        # Save as .txt file
        clean_filename = f"transformed_{os.path.splitext(filename)[0]}.txt"
        clean_path = os.path.join(CLEAN_DIR, clean_filename)
        with open(clean_path, 'w', encoding='utf-8') as f:
            f.write(output)
        logger.debug(f"Saved transformed data to {clean_path}:\n{open(clean_path, 'r', encoding='utf-8').read()[:1000]}")

        # Verify saved file
        saved_df = pd.read_csv(clean_path)
        if saved_df.empty or list(saved_df.columns) != expected_cols:
            logger.error(f"Saved transformed file {clean_path} is invalid")
            return None

        logger.info(f"✅ Successfully transformed and saved: {clean_path}")
        return clean_path

    except Exception as e:
        logger.error(f"Error validating or saving transformed data for {filename}: {str(e)}")
        return None