import os
import pandas as pd
import logging
import io
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic.v1 import BaseModel, Field
import time
from sklearn.preprocessing import LabelEncoder

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ORG_DIR = os.path.abspath("organized_data")
CLEAN_DIR = os.path.abspath("transformed_datas")
os.makedirs(CLEAN_DIR, exist_ok=True)

class AnalyzeAndTransformInput(BaseModel):
    filename: str = Field(description="The name of the file being transformed")
    category: str = Field(description="The category of the data")
    csv_data: str = Field(description="The raw CSV data to transform")

@tool(args_schema=AnalyzeAndTransformInput)
def analyze_and_transform(filename: str, category: str, csv_data: str) -> str:
    """
    Transforms the raw CSV data into a cleaned dataset with added features.
    Returns the transformed CSV string with exactly 7 columns: sensor_id, timestamp, value, location, device_type, year, hour.
    """
    logger.debug(f"Input CSV data for {filename}:\n{csv_data[:1000]}")
    try:
        df = pd.read_csv(io.StringIO(csv_data))

        # 1. Handle Missing Values:
        for col in df.columns:
            if df[col].isnull().any():
                if pd.api.types.is_numeric_dtype(df[col]):
                    df[col] = df[col].fillna(df[col].mean())
                else:
                    df[col] = df[col].fillna("Unknown")

        # 2. Convert Data Types:
        df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
        df['value'] = pd.to_numeric(df['value'], errors='coerce')
        for col in ['location', 'device_type']:
            if col in df.columns:
                df[col] = df[col].astype(str)

        # 3. Feature Engineering:
        df['year'] = df['timestamp'].dt.year
        df['hour'] = df['timestamp'].dt.hour

        # 4. Remove duplicate rows
        df.drop_duplicates(inplace=True)

        # Ensure correct column order and selection and rename
        expected_cols = ['sensor_id', 'timestamp', 'value', 'location', 'device_type', 'year', 'hour']
        df = df[expected_cols]

        # Convert the transformed data back to CSV format
        csv_output = df.to_csv(index=False, encoding='utf-8', lineterminator='\n')
        logger.debug(f"Transformed CSV Data:\n{csv_output[:1000]}")

        # Verify each row has exactly 7 columns
        csv_lines = csv_output.strip().split('\n')
        header = csv_lines[0].split(',')
        for i, line in enumerate(csv_lines[1:], start=1):
            fields = line.split(',')
            if len(fields) != 7:
                logger.error(f"Line {i + 1} has {len(fields)} fields, expected 7. Line content: {line}")
                raise ValueError(f"Data integrity issue: Line {i + 1} has {len(fields)} columns, expected 7")

        return csv_output

    except Exception as e:
        logger.error(f"Error during data transformation: {str(e)}")
        return f"Error: {str(e)}"

def transform_file(filename: str, category: str):
    logger.info(f"🔁 Transforming: {filename} in category {category}")
    file_path = os.path.join(ORG_DIR, category, filename)

    # Load dataset
    try:
        if filename.endswith('.csv'):
            df = pd.read_csv(file_path)
        elif filename.endswith('.json'):
            df = pd.read_json(file_path)
        elif filename.endswith('.xlsx'):
            df = pd.read_excel(file_path)
        else:
            raise ValueError("Unsupported file type")
    except Exception as e:
        logger.error(f"Failed to load file {file_path}: {str(e)}")
        return None

    # Prepare inputs
    csv_string = df.to_csv(index=False)
    if not csv_string or csv_string.strip() == "":
        logger.error(f"Empty CSV data generated for {file_path}")
        return None

    # Setup Gemini + tools
    llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=0.0, google_api_key=os.getenv("GOOGLE_API_KEY"))
    tools = [analyze_and_transform]

    prompt = ChatPromptTemplate.from_messages([
        ("system", """
You are an AI-powered data transformation expert. Your task is to transform the provided raw CSV data into a cleaned and enhanced dataset in a single pass. Follow these steps strictly:
1. Handle Missing Values: Fill numeric columns with the mean, categorical columns with "Unknown".
2. Convert Data Types: Ensure 'timestamp' is in datetime format, 'value' is numeric, and 'device_type' and 'location' are strings.
3. Feature Engineering: Add a 'year' column from 'timestamp' and an 'hour' column.
4. Remove duplicate rows.
5. Ensure your data only include the following columns sensor_id,timestamp,value,location,device_type,year,hour,
6. Return ONLY a raw CSV string with exactly 7 columns: sensor_id,timestamp,value,location,device_type,year,hour.
Do NOT include any markdown (e.g., ```), code blocks, comments, or extra text.
Ensure EVERY row has exactly 7 fields, with commas as delimiters.
If the data is invalid or cannot be transformed, return 'Error: <description of the issue>' as plain text.
Process all rows completely and avoid truncation. Respond with the CSV string or error message only.
        """),
        ("human", "Transform this dataset:\nFilename: {filename}\nCategory: {category}\nRaw CSV Data:\n{csv_data}\n{agent_scratchpad}")
    ])

    agent = create_openai_functions_agent(llm=llm, tools=tools, prompt=prompt)
    agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True, handle_parsing_errors=True, max_iterations=1)

    # Add timeout to prevent infinite loops
    start_time = time.time()
    max_execution_time = 60  # Increased to 60 seconds

    result = agent_executor.invoke({
        "filename": filename,
        "category": category,
        "csv_data": csv_string,
        "agent_scratchpad": ""
    })

    if time.time() - start_time > max_execution_time:
        logger.error(f"Transformation for {filename} exceeded {max_execution_time} seconds, terminating")
        return None

    # Validate result
    output = result["output"]
    logger.debug(f"Full LLM output for {filename}:\n{output}")  # Log full output for debugging
    if output.startswith("Error:"):
        logger.error(f"Transformation failed for {filename}: {output}")
        return None

    # Pre-process and validate CSV, removing non-data lines
    try:
        lines = [line for line in output.strip().split('\n') if line and not line.startswith('```')]
        if not lines or len(lines) < 2:  # Need header + at least one data row
            logger.error(f"Transformed data for {filename} has insufficient rows: {len(lines)}")
            return None
        header = lines[0].split(',')
        expected_cols = 7
        for i, line in enumerate(lines[1:], 1):
            fields = line.split(',')
            if len(fields) != expected_cols:
                logger.error(f"Line {i+1} has {len(fields)} fields, expected {expected_cols}: '{line}'")
                return None

        df_transformed = pd.read_csv(io.StringIO('\n'.join(lines)))
        if df_transformed.empty or df_transformed.columns.empty:
            logger.error(f"Transformed data for {filename} is invalid after parsing")
            return None

        clean_filename = f"transformed_{os.path.splitext(filename)[0]}.csv"
        clean_path = os.path.join(CLEAN_DIR, clean_filename)

        df_transformed.to_csv(clean_path, index=False, encoding="utf-8", lineterminator='\n')
        logger.debug(f"Written transformed data to {clean_path}:\n{open(clean_path, 'r', encoding='utf-8').read()[:1000]}")

        saved_df = pd.read_csv(clean_path)
        if saved_df.empty or saved_df.columns.empty:
            logger.error(f"Saved transformed file {clean_path} is invalid")
            return None
    except Exception as e:
        logger.error(f"Error writing or validating file: {str(e)}")
        return None

    logger.info(f"✅ Saved cleaned data: {clean_path}")
    return clean_path