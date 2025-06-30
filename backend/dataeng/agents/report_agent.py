import os
import pandas as pd
import logging
import io
import time
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import tool
from pydantic.v1 import BaseModel, Field
from pymongo import MongoClient
from google.api_core.exceptions import ResourceExhausted

# Setup logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Paths
CLEAN_DIR = os.path.abspath("transformed_data")  # Fixed from "transformed_datas"
REPORT_DIR = os.path.abspath("report")
os.makedirs(REPORT_DIR, exist_ok=True)

def get_mongo_client():
    """Initialize MongoDB client from environment variable."""
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        logger.error("MONGO_URI not set in environment variables")
        raise ValueError("MONGO_URI not set")
    return MongoClient(mongo_uri)

# ------------------ Tool Input Schema ------------------ #
class ReportInput(BaseModel):
    csv_data: str = Field(description="The raw CSV data as a string")
    filename: str = Field(description="The name of the CSV file")
    category: str = Field(description="The category of the data (MongoDB collection name)")
    db_name: str = Field(description="Name of the MongoDB database")

# ------------------ Report Generator Tool ------------------ #
@tool(args_schema=ReportInput)
def generate_report(csv_data: str, filename: str, category: str, db_name: str) -> str:
    """
    Passes the CSV data to the LLM to generate a structured Markdown report.
    The LLM will analyze the data and create a report including schema summary,
    column types, row/column counts, missing values, detected anomalies,
    feature engineering performed, and additional data profiling.
    """
    logger.debug(f"Input CSV data for {filename} (category: {category}, db: {db_name}):\n{csv_data[:1000]}")
    return csv_data

# ------------------ Agent Runner ------------------ #
def run_report_agent(filename: str, category: str, db_name: str) -> str:
    logger.info(f"📊 Starting report generation for {filename} (category: {category}, db: {db_name})")
    file_path = os.path.join(CLEAN_DIR, filename)

    try:
        if not os.path.exists(file_path):
            logger.error(f"❌ File not found: {file_path}")
            return None

        # Read and validate the CSV file
        with open(file_path, 'r', encoding='utf-8') as f:
            csv_content = f.read()
        logger.debug(f"Raw file content for {filename}:\n{csv_content[:1000]}")
        if not csv_content or csv_content.strip() == "":
            logger.error(f"❌ Empty content in {file_path}")
            return None

        # Attempt to parse CSV with error handling
        try:
            df = pd.read_csv(io.StringIO(csv_content))
            logger.debug(f"Parsed DataFrame for {filename}:\n{df.head().to_string()}")
        except pd.errors.ParserError as e:
            logger.error(f"❌ Failed to parse CSV content for {filename}: {str(e)}")
            with open(file_path, 'r', encoding='utf-8') as f:
                logger.error(f"Corrupted file content:\n{f.read()}")
            return None

        if df.empty or df.columns.empty:
            logger.error(f"❌ Invalid dataset: Empty or missing columns in {filename}")
            return None

        csv_data = df.to_csv(index=False)
        if not csv_data or csv_data.strip() == "":
            logger.error(f"❌ Empty CSV data generated for {filename}")
            return None

        logger.debug(f"Final CSV data for {filename}:\n{csv_data[:1000]}")

        # Fetch schema from MongoDB to identify primary key
        try:
            client = get_mongo_client()
            db = client[db_name]
            schemas_collection = db['schemas']
            schema_doc = schemas_collection.find_one({"category": category.lower()})
            client.close()
            expected_columns = schema_doc.get("columns", []) if schema_doc else []
            primary_key = None
            if schema_doc:
                for col in expected_columns:
                    if 'id' in col.lower():
                        primary_key = col
                        break
                if not primary_key:
                    primary_key = expected_columns[0] if expected_columns else "Unknown"
        except Exception as e:
            logger.warning(f"Failed to fetch schema for {db_name}.{category}: {str(e)}")
            primary_key = "Unknown"
            expected_columns = df.columns.tolist()

        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-pro",  # Standardized model
            temperature=0,
            google_api_key=os.getenv("GOOGLE_API_KEY_report_agent")
        )

        def invoke_with_retry(llm, prompt, max_retries=3, retry_delay=2):
            for attempt in range(max_retries):
                try:
                    return llm.invoke(prompt)
                except ResourceExhausted as e:
                    if attempt == max_retries - 1:
                        raise
                    logger.warning(f"ResourceExhausted error, retrying in {retry_delay} seconds: {str(e)}")
                    time.sleep(retry_delay)
            return None

        tools = [generate_report]

        prompt = ChatPromptTemplate.from_messages([
            ("system", """
            You are an expert data analyst. Your task is to analyze the provided CSV data and generate a structured Markdown report for the given category and database. The report must include the following sections:
            - **File**: The name of the file.
            - **Category**: The category of the data (e.g., 'iot', 'sales').
            - **Database**: The MongoDB database name.
            - **Schema**: A summary of column names and their inferred data types (e.g., TEXT, INTEGER, REAL).
            - **Shape**: The number of rows and columns.
            - **Data Profiling**:
              - Total count of entries per column (non-null values).
              - Unique value count per column.
              - Sum of null values across all columns, with details per column if applicable.
            - **Primary Key**: The identified primary key column (e.g., 'sensor_id' for iot, 'invoice_id' for sales).
            - **Missing Values**: A list of columns with missing values and their counts, or a note if none.
            - **Anomalies**: Detected issues such as negative values in numeric columns, duplicate rows, or outliers (e.g., unusually high/low values based on standard deviation or IQR).
            - **Feature Engineering Performed**: Describe the feature engineering already applied to the dataset, based on the category. For example:
              - For 'iot', a 'day_of_month' column may have been derived from 'timestamp'.
              - For 'sales', a 'day_of_week' column may have been derived from 'date'.
              Analyze the columns to infer which were likely derived (e.g., 'day_of_month', 'hour_of_day', 'day_of_week') by checking for columns that are not typically raw data (e.g., derived from date/time or computed metrics).
            - **Feature Engineering Suggestions**: Additional suggestions for derived features (e.g., 'hour_of_day' from 'timestamp', temperature ranges from 'value').

            Use the `generate_report` tool to process the CSV data. Return the report as a well-formatted Markdown string with clear section headers. If the data is empty or invalid, return an error message in Markdown format (e.g., '# Error\nInvalid or empty dataset'). Use the provided category and database name to contextualize the analysis.
            """),
            ("human", """
            Generate a markdown report for:
            Filename: {filename}
            Category: {category}
            Database: {db_name}
            CSV Data:
            {csv_data}
            {agent_scratchpad}
            """)
        ])

        agent = create_openai_functions_agent(llm=llm, tools=tools, prompt=prompt)
        executor = AgentExecutor(
            agent=agent,
            tools=tools,
            verbose=True,
            handle_parsing_errors=True,
            max_iterations=7
        )

        result = invoke_with_retry(executor, {
            "filename": filename,
            "csv_data": csv_data,
            "category": category,
            "db_name": db_name,
            "agent_scratchpad": ""
        })

        report_text = result["output"]
        if report_text.startswith("# Error"):
            logger.error(f"❌ Failed to generate report for {filename}:\n{report_text}")
            return None

        report_path = os.path.join(REPORT_DIR, f"{os.path.splitext(filename)[0]}.md")
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(report_text)

        logger.info(f"✅ Report saved at: {report_path}")
        return report_path

    except FileNotFoundError:
        logger.error(f"❌ File not found: {file_path}")
        return None
    except pd.errors.ParserError as e:
        logger.error(f"❌ Failed to parse CSV file {file_path}: {e}")
        return None
    except Exception as e:
        logger.error(f"❌ Unexpected error while generating report for {filename}: {e}")
        return None