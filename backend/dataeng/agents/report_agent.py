import os
import pandas as pd
import logging
import io
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic.v1 import BaseModel, Field

# Setup logging
logging.basicConfig(level=logging.DEBUG)  # Set to DEBUG for detailed logs
logger = logging.getLogger(__name__)

# Paths
CLEAN_DIR = "transformed_datas/"
REPORT_DIR = "report/"
os.makedirs(REPORT_DIR, exist_ok=True)

# ------------------ Tool Input Schema ------------------ #
class ReportInput(BaseModel):
    csv_data: str = Field(description="The raw CSV data as a string")
    filename: str = Field(description="The name of the CSV file")

# ------------------ Report Generator Tool ------------------ #
@tool(args_schema=ReportInput)
def generate_report(csv_data: str, filename: str) -> str:
    """
    Passes the CSV data to the LLM to generate a structured Markdown report.
    The LLM will analyze the data and create a report including schema summary,
    column types, row/column counts, missing values, detected anomalies, and
    feature engineering hints.
    """
    logger.debug(f"Input CSV data for {filename}:\n{csv_data[:1000]}")  # Log first 1000 chars
    return csv_data  # Pass the data to the LLM via the prompt

# ------------------ Agent Runner ------------------ #
def run_report_agent(filename: str) -> str:
    logger.info(f"📊 Starting report generation for {filename}")
    file_path = os.path.join(CLEAN_DIR, filename)

    try:
        if not os.path.exists(file_path):
            logger.error(f"❌ File not found: {file_path}")
            return None

        # Read and validate the CSV file
        with open(file_path, 'r', encoding='utf-8') as f:
            csv_content = f.read()
        logger.debug(f"Raw file content for {filename}:\n{csv_content[:1000]}")  # Log raw content
        if not csv_content or csv_content.strip() == "":
            logger.error(f"❌ Empty content in {file_path}")
            return None

        # Attempt to parse CSV with error handling
        try:
            df = pd.read_csv(io.StringIO(csv_content))  # Use StringIO to parse raw content
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

        logger.debug(f"Final CSV data for {filename}:\n{csv_data[:1000]}")  # Log final CSV data

        llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            temperature=0,
            google_api_key=os.getenv("GOOGLE_API_KEY")
        )

        tools = [generate_report]

        prompt = ChatPromptTemplate.from_messages([
            ("system", """
            You are an expert data analyst. Your task is to analyze the provided CSV data and generate a structured Markdown report.
            The report must include the following sections:
            - **File**: The name of the file.
            - **Schema**: A summary of column names and their data types.
            - **Shape**: The number of rows and columns.
            - **Missing Values**: A list of columns with missing values and their counts, or a note if none.
            - **Anomalies**: Detected issues such as negative values in numeric columns or duplicate rows.
            - **Feature Engineering**: Suggestions for derived features (e.g., age from date_of_birth).

            Use the `generate_report` tool to process the CSV data. Return the report as a well-formatted Markdown string. If the data is empty or invalid, return an error message in Markdown format (e.g., '# Error\nInvalid or empty dataset').
                        """),
                        ("human", "Generate a markdown report for:\nFilename: {filename}\nCSV Data:\n{csv_data}\n{agent_scratchpad}")
                    ])

        agent = create_openai_functions_agent(llm=llm, tools=tools, prompt=prompt)
        executor = AgentExecutor(
            agent=agent,
            tools=tools,
            verbose=True,
            handle_parsing_errors=True,
            max_iterations=3
        )

        result = executor.invoke({
            "filename": filename,
            "csv_data": csv_data,
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