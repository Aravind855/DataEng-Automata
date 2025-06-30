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
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('dataeng')
logger.setLevel(logging.DEBUG)
logging.getLogger('pymongo').setLevel(logging.WARNING)

# Directory paths
CLEAN_DIR = os.path.abspath("clean_data")
TRANSFORMED_DIR = os.path.abspath("transformed_data")  # Fixed from "transformed_datas"
os.makedirs(CLEAN_DIR, exist_ok=True)
os.makedirs(TRANSFORMED_DIR, exist_ok=True)

def get_mongo_client():
    """Initialize MongoDB client from environment variable."""
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        logger.error("MONGO_URI not set in environment variables")
        raise ValueError("MONGO_URI not set")
    return MongoClient(mongo_uri)

class AnalyzeAndTransformInput(BaseModel):
    filename: str = Field(description="The name of the file being transformed")
    category: str = Field(description="The category of the data (MongoDB collection name)")
    db_name: str = Field(description="Name of the MongoDB database")

@tool(args_schema=AnalyzeAndTransformInput)
def analyze_and_transform(filename: str, category: str, db_name: str) -> str:
    """
    Transforms data from a MongoDB collection using AI: cleans data, performs feature engineering,
    and returns the transformed data as a CSV string.
    """
    logger.debug(f"Processing transformation for {filename} in category {category} from {db_name}")
    try:
        # Fetch data from MongoDB
        client = get_mongo_client()
        db = client[db_name]
        collection = db[category.lower()]
        records = list(collection.find({}, {'_id': 0}))
        client.close()

        if not records:
            logger.error(f"No data found in {db_name}.{category}")
            return f"Error: No data found in collection {category}"

        df = pd.DataFrame(records)
        if df.empty:
            logger.error(f"Empty dataset for {filename} in {db_name}.{category}")
            return f"Error: Empty dataset for {filename}"

        # Convert DataFrame to CSV for LLM processing
        csv_input = df.to_csv(index=False, encoding='utf-8', lineterminator='\n')

        # Initialize Gemini LLM
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-pro",  # Updated to stable model
            temperature=0.0,
            google_api_key=os.getenv("GOOGLE_API_KEY_transformation_agent")
        )
        if not os.getenv("GOOGLE_API_KEY_transformation_agent"):
            logger.error("GOOGLE_API_KEY_transformation_agent not set in environment variables")
            return f"Error: GOOGLE_API_KEY_transformation_agent not set"

        # Define prompt for transformation
        prompt = ChatPromptTemplate.from_messages([
            ("system", """
                You are a data transformation agent. Analyze the provided dataset and:
                1. Handle Missing Values: Impute missing numeric values with the mean of their respective columns. Replace missing non-numeric values with the string "Unknown".
                2. Remove Duplicates: Eliminate all duplicate rows from the dataset.
                3. Feature Engineering: Analyze the columns and their data types to create a new, relevant feature column. The new column's name and content should be dynamically determined based on the dataset and category (e.g., for 'iot' data with a 'timestamp' column, you might derive 'day_of_month' or 'hour_of_day'). The new column should provide meaningful insights and not be constrained to a specific name or type.
                4. Data Type and Format Standardization:
                   - Ensure all date columns are formatted as "DD-MM-YYYY".
                   - Verify that all numeric columns are appropriately typed (e.g., integer or float).
                Return only the transformed data in CSV format, including headers, without any surrounding text, explanations, or markdown formatting (e.g., no ```csv or backticks).
            """),
            ("human", "Transform this data from MongoDB collection:\n"
                      "Filename: {filename}\n"
                      "Category: {category}\n"
                      "Database: {db_name}\n"
                      "CSV Data:\n{csv_data}")
        ])

        # Run transformation with retry logic
        def invoke_with_retry(llm, prompt, max_retries=3, retry_delay=2):
            for attempt in range(max_retries):
                try:
                    return llm.invoke(prompt)
                except ResourceExhausted as e:
                    if attempt == max_retries - 1:
                        logger.error(f"Failed to transform data after {max_retries} retries: {str(e)}")
                        return None
                    logger.warning(f"ResourceExhausted error, retrying in {retry_delay} seconds: {str(e)}")
                    time.sleep(retry_delay)
            return None

        chain = prompt | llm
        response = invoke_with_retry(llm, prompt.invoke({
            "filename": filename,
            "category": category,
            "db_name": db_name,
            "csv_data": csv_input
        }))
        if response is None:
            logger.error(f"Failed to transform data after retries for {filename}")
            return f"Error: Failed to transform data after retries"

        csv_output = response.content.strip()

        # Validate CSV output
        try:
            df_transformed = pd.read_csv(io.StringIO(csv_output))
            if df_transformed.empty:
                logger.error(f"Transformed data for {filename} is empty")
                return f"Error: Transformed data is empty"
        except Exception as e:
            logger.error(f"Invalid CSV output for {filename}: {str(e)}")
            return f"Error: Invalid CSV output: {str(e)}"

        logger.debug(f"Transformed CSV data (first 1000 chars):\n{csv_output[:1000]}")
        return csv_output

    except Exception as e:
        logger.error(f"Error during transformation for {filename}: {str(e)}")
        return f"Error: {str(e)}"

class IngestTransformedInput(BaseModel):
    filename: str = Field(description="The name of the file being transformed")
    category: str = Field(description="The category of the data")
    db_name: str = Field(description="Name of the MongoDB database")
    csv_data: str = Field(description="The transformed CSV data")

@tool(args_schema=IngestTransformedInput)
def ingest_transformed_tool(filename: str, category: str, db_name: str, csv_data: str) -> str:
    """
    Ingests transformed data into a MongoDB collection named transformed_<category>.
    """
    logger.debug(f"Ingesting transformed data for {filename} into {db_name}.transformed_{category}")
    try:
        # Read and validate CSV data
        df = pd.read_csv(io.StringIO(csv_data))
        if df.empty:
            logger.error(f"Empty transformed data for {filename}")
            return f"Error: Empty transformed data"

        logger.debug(f"Transformed DataFrame columns: {list(df.columns)}")
        logger.debug(f"Transformed DataFrame head:\n{df.head().to_string()}")

        # Convert to records
        records = df.to_dict('records')
        if not records:
            logger.error(f"No records to insert for {filename}")
            return f"Error: No records to insert"

        # Insert into MongoDB
        client = get_mongo_client()
        db = client[db_name]
        collection = db[f"transformed_{category.lower()}"]
        
        # Clear existing data (optional, depending on requirements)
        collection.delete_many({})
        
        # Insert new records
        result = collection.insert_many(records)
        client.close()
        
        logger.info(f"Inserted {len(result.inserted_ids)} records into {db_name}.transformed_{category}")
        return f"Inserted {len(result.inserted_ids)} records"
    except Exception as e:
        logger.error(f"Error ingesting transformed data for {filename}: {str(e)}")
        return f"Error: {str(e)}"

def transform_file(filename: str, category: str, db_name: str) -> str:
    """
    Orchestrates the transformation of data from a MongoDB collection.
    Saves the transformed data to clean_data/ and transformed_data/ as CSV and ingests into transformed_<category> collection.
    Returns the path to the saved CSV in clean_data/ or None if transformation fails.
    """
    logger.info(f"🔁 Starting transformation for {filename} in category {category} from {db_name}")
    
    # Initialize LangChain agent with Gemini
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-pro",  # Updated to stable model
        temperature=0.0,
        google_api_key=os.getenv("GOOGLE_API_KEY_transformation_agent")
    )
    if not os.getenv("GOOGLE_API_KEY_transformation_agent"):
        logger.error("GOOGLE_API_KEY_transformation_agent not set in environment variables")
        return None

    tools = [analyze_and_transform, ingest_transformed_tool]
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a data transformation agent that cleans data, performs feature engineering, "
                   "and ingests transformed data into MongoDB. Return the path to the saved CSV file in clean_data/."),
        ("human", "Transform data from MongoDB collection:\n"
                  "Filename: {filename}\n"
                  "Category: {category}\n"
                  "Database: {db_name}\n"
                  "Steps:\n1. Call analyze_and_transform to clean data and add features, returning CSV data.\n"
                  "2. Call ingest_transformed_tool to insert transformed data into transformed_<category> collection.\n"
                  "Output: Path to the saved CSV file in clean_data/.\n{agent_scratchpad}")
    ])
    agent = create_openai_functions_agent(llm=llm, tools=tools, prompt=prompt)
    agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True, handle_parsing_errors=True)

    # Run transformation
    try:
        result = agent_executor.invoke({
            "filename": filename,
            "category": category,
            "db_name": db_name,
            "agent_scratchpad": ""
        })
        output = result.get("output", "")
        logger.debug(f"AgentExecutor output: {output}")

        if output.startswith("Error:"):
            logger.error(f"Transformation failed for {filename}: {output}")
            return None

        # Save transformed data as CSV
        csv_data = analyze_and_transform.invoke({
            "filename": filename,
            "category": category,
            "db_name": db_name
        })
        if csv_data.startswith("Error:"):
            logger.error(f"Transformation failed for {filename}: {csv_data}")
            return None

        clean_filename = f"transformed_{os.path.splitext(filename)[0]}.csv"
        clean_path = os.path.join(CLEAN_DIR, clean_filename)
        transformed_path = os.path.join(TRANSFORMED_DIR, clean_filename)

        # Save to clean_data/
        with open(clean_path, 'w', encoding='utf-8') as f:
            f.write(csv_data)
        logger.debug(f"Saved transformed CSV to {clean_path}")

        # Save to transformed_data/
        with open(transformed_path, 'w', encoding='utf-8') as f:
            f.write(csv_data)
        logger.debug(f"Saved transformed CSV to {transformed_path}")

        # Verify saved file in clean_data/
        try:
            df = pd.read_csv(clean_path)
            if df.empty:
                logger.error(f"Saved transformed file {clean_path} is empty")
                return None
        except Exception as e:
            logger.error(f"Invalid CSV saved at {clean_path}: {str(e)}")
            return None

        # Ingest transformed data
        ingest_result = ingest_transformed_tool.invoke({
            "filename": filename,
            "category": category,
            "db_name": db_name,
            "csv_data": csv_data
        })
        if ingest_result.startswith("Error:"):
            logger.error(f"Ingestion failed for {filename}: {ingest_result}")
            return None

        logger.info(f"✅ Successfully transformed and saved: {clean_path} and {transformed_path}")
        return clean_path

    except Exception as e:
        logger.error(f"Error in transform_file for {filename}: {str(e)}")
        return None