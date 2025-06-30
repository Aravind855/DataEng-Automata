import os
import pandas as pd
from datetime import datetime
from shutil import move
from pymongo import MongoClient
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import tool
from pydantic.v1 import BaseModel, Field
import logging
import re
import time

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('dataeng')
logger.setLevel(logging.DEBUG)
logging.getLogger('pymongo').setLevel(logging.WARNING)

RAW_DIR = "raw_data/"
ORG_DIR = "organized_data/"
LOG_DIR = "logs/"

os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(ORG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "ingestion.log")
if not os.path.exists(LOG_FILE):
    with open(LOG_FILE, "a") as f:
        pass

def get_mongo_client():
    """Initialize MongoDB client from environment variable."""
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        logger.error("MONGO_URI not set in environment variables")
        raise ValueError("MONGO_URI not set")
    return MongoClient(mongo_uri)

class ClassifyDatasetInput(BaseModel):
    columns: list[str] = Field(description="List of column names in the file")
    db_name: str = Field(description="Name of the MongoDB database")

@tool(args_schema=ClassifyDatasetInput)
def classify_dataset_tool(columns: list, db_name: str) -> str:
    """Classifies the dataset by matching its columns against schemas in the database."""
    logger.debug(f"Classifying dataset for {db_name}, columns: {columns}")
    try:
        client = get_mongo_client()
        db = client[db_name]
        schemas_collection = db['schemas']
        schemas = list(schemas_collection.find({}, {'_id': 0, 'category': 1, 'columns': 1}))
        client.close()

        if not schemas:
            logger.error(f"No schemas found in {db_name}.schemas")
            return "Error: No schemas found"

        best_match = None
        highest_match_count = 0

        for schema in schemas:
            schema_columns = set(schema['columns'])
            file_columns = set(columns)
            match_count = len(schema_columns.intersection(file_columns))
            if match_count > highest_match_count:
                highest_match_count = match_count
                best_match = schema['category']

        if best_match is None:
            logger.error(f"No matching schema found for columns: {columns}")
            return "Error: No matching schema found"

        logger.debug(f"Best match: category={best_match}, match_count={highest_match_count}")
        return best_match
    except Exception as e:
        logger.error(f"Error classifying dataset: {str(e)}")
        return f"Error: {str(e)}"

class ValidateSchemaInput(BaseModel):
    columns: list[str] = Field(description="List of column names in the file")
    db_name: str = Field(description="Name of the MongoDB database")
    category: str = Field(description="Category of the file")

@tool(args_schema=ValidateSchemaInput)
def validate_schema_tool(columns: list, db_name: str, category: str) -> bool:
    """Validates schema columns against constraints stored in MongoDB."""
    logger.debug(f"Validating schema for {db_name}.{category}, columns: {columns}")
    try:
        client = get_mongo_client()
        db = client[db_name]
        schemas_collection = db['schemas']
        schema_doc = schemas_collection.find_one({"category": case_insensitive(category)})
        client.close()
        if not schema_doc or "columns" not in schema_doc:
            logger.error(f"No schema found for {db_name}.{category}")
            return False
        expected_columns = schema_doc["columns"]
        valid = all(col in columns for col in expected_columns)
        logger.debug(f"Schema validation result: {valid}, expected: {expected_columns}")
        return valid
    except Exception as e:
        logger.error(f"Error validating schema: {str(e)}")
        return False

def case_insensitive(category: str) -> dict:
    """Helper function to perform case-insensitive MongoDB query."""
    return {"$regex": f"^{category}$", "$options": "i"}

class IdentifyPrimaryKeyInput(BaseModel):
    columns: list[str] = Field(description="List of column names in the file")
    db_name: str = Field(description="Name of the MongoDB database")
    category: str = Field(description="Category of the file")

@tool(args_schema=IdentifyPrimaryKeyInput)
def identify_primary_key_tool(columns: list, db_name: str, category: str) -> str:
    """Identifies the primary key for the dataset using the schema and LLM analysis."""
    logger.debug(f"Identifying primary key for {db_name}.{category}, columns: {columns}")
    try:
        client = get_mongo_client()
        db = client[db_name]
        schemas_collection = db['schemas']
        schema_doc = schemas_collection.find_one({"category": case_insensitive(category)})
        client.close()

        if not schema_doc or "columns" not in schema_doc:
            logger.error(f"No schema found for {db_name}.{category}")
            return "Error: No schema found"

        schema_columns = schema_doc["columns"]
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            temperature=0.0,
            google_api_key=os.getenv("GOOGLE_API_KEY_data_ingestion"),
            timeout=30
        )
        prompt = (
            f"Given the following schema for category '{category}' with columns {schema_columns}, "
            f"and the dataset columns {columns}, identify the most likely primary key column. "
            "Primary keys are typically unique identifiers like 'id', 'invoice_id', 'sensor_id', etc. "
            "If no clear primary key is identified, choose the first column as the default. "
            "Return only the column name."
        )

        response = llm.invoke(prompt)
        primary_key = response.content.strip()
        
        if primary_key not in columns:
            logger.warning(f"LLM suggested primary key '{primary_key}' not in columns, defaulting to first column")
            primary_key = columns[0] if columns else "Error: No columns available"

        logger.debug(f"Identified primary key: {primary_key}")
        return primary_key
    except Exception as e:
        logger.error(f"Error identifying primary key: {str(e)}")
        return f"Error: {str(e)}"

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

class InsertToMongoInput(BaseModel):
    filepath: str = Field(description="Path to the file")
    filename: str = Field(description="Name of the file")
    db_name: str = Field(description="Name of the MongoDB database")
    category: str = Field(description="Category of the file")
    primary_key: str = Field(description="Primary key column for the dataset")

@tool(args_schema=InsertToMongoInput)
def insert_to_mongo_tool(filepath: str, filename: str, db_name: str, category: str, primary_key: str) -> str:
    """Inserts or updates file data into a MongoDB collection named after the schema category, preventing duplicates."""
    logger.debug(f"Inserting/updating data from {filename} into {db_name}.{category} using primary key {primary_key}")
    try:
        # Load the file
        if filename.endswith('.csv'):
            df = pd.read_csv(filepath)
        elif filename.endswith('.json'):
            df = pd.read_json(filepath)
        elif filename.endswith('.xlsx'):
            df = pd.read_excel(filepath, engine='openpyxl')
        else:
            logger.error(f"Unsupported file format: {filename}")
            return f"Error: Unsupported file format"

        # Convert DataFrame to list of dictionaries
        records = df.to_dict('records')
        if not records:
            logger.warning(f"No records to insert from {filename}")
            return f"Error: No records to insert"

        # Initialize MongoDB client
        client = get_mongo_client()
        db = client[db_name]
        collection = db[category.lower()]  # Use category as collection name, lowercase for consistency

        # Check if collection exists, create if not
        if category.lower() not in db.list_collection_names():
            logger.info(f"Creating new collection: {db_name}.{category.lower()}")
            db.create_collection(category.lower())

        inserted_count = 0
        skipped_count = 0

        for record in records:
            if primary_key not in record:
                logger.warning(f"Primary key {primary_key} not found in record, inserting as new")
                collection.insert_one(record)
                inserted_count += 1
                continue

            # Check if record with primary key exists
            existing_record = collection.find_one({primary_key: record[primary_key]})
            if existing_record:
                # Compare records to avoid unnecessary updates
                if all(existing_record.get(k) == v for k, v in record.items()):
                    logger.debug(f"Skipping duplicate record with {primary_key}: {record[primary_key]}")
                    skipped_count += 1
                    continue
                else:
                    # Update if record differs
                    collection.update_one(
                        {primary_key: record[primary_key]},
                        {'$set': record},
                        upsert=True
                    )
                    inserted_count += 1
                    logger.debug(f"Updated record with {primary_key}: {record[primary_key]}")
            else:
                # Insert new record
                collection.insert_one(record)
                inserted_count += 1
                logger.debug(f"Inserted new record with {primary_key}: {record[primary_key]}")

        client.close()
        logger.debug(f"Processed {inserted_count} records, skipped {skipped_count} duplicates in {db_name}.{category.lower()}")
        return f"Inserted/Updated {inserted_count} records, Skipped {skipped_count} duplicates"
    except Exception as e:
        logger.error(f"Error processing data into {db_name}.{category.lower()}: {str(e)}")
        return f"Error: {str(e)}"

def ingest_file(filepath: str, filename: str, db_name: str):
    logger.info(f"Processing file: {filepath} for database {db_name}")
    try:
        # Load the file to get columns
        if filename.endswith('.csv'):
            df = pd.read_csv(filepath)
        elif filename.endswith('.json'):
            df = pd.read_json(filepath)
        elif filename.endswith('.xlsx'):
            df = pd.read_excel(filepath, engine='openpyxl')
        else:
            logger.error(f"Unsupported file format: {filename}")
            raise ValueError("Unsupported file format")

        columns = df.columns.tolist()
        columns_str = ", ".join(columns)

        # Initialize LangChain agent with Gemini
        try:
            llm = ChatGoogleGenerativeAI(
                model="gemini-2.0-flash",
                temperature=0.0,
                google_api_key=os.getenv("GOOGLE_API_KEY_data_ingestion"),
                timeout=30
            )
            # Test LLM responsiveness
            start_time = time.time()
            test_response = llm.invoke("Test prompt: Return 'OK'")
            logger.debug(f"LLM test response: {test_response.content}, latency: {time.time() - start_time:.2f}s")
            if test_response.content.strip() != "OK":
                logger.warning("LLM test failed, proceeding with manual workflow")
                raise ValueError("LLM test failed")
        except Exception as e:
            logger.error(f"LLM initialization failed: {str(e)}, falling back to manual workflow")
            return manual_ingest_file(filepath, filename, db_name, columns)

        tools = [
            classify_dataset_tool,
            validate_schema_tool,
            identify_primary_key_tool,
            insert_to_mongo_tool,
            move_to_category_tool,
            log_summary_tool
        ]

        prompt = ChatPromptTemplate.from_messages([
            ("system", """
                You are a data ingestion agent that processes datasets in a strict sequence of steps. Execute each tool exactly once, in the following order, and stop immediately after producing the final output. Do not repeat any steps, call additional tools, or continue after step 6. If any tool returns an error, stop and output: Error: <error message>. If the schema is invalid, stop and output: Error: Schema validation failed. Follow these steps:
                1. Call `classify_dataset_tool` to classify the dataset by matching columns to schemas in the database. Store the result as `category`.
                2. Call `validate_schema_tool` to validate the schema for `category`. Store the result as `valid`.
                3. If `valid` is False, output: Error: Schema validation failed.
                4. If `valid` is True, call `identify_primary_key_tool` to determine the primary key.
                5. If `valid` is True, call `insert_to_mongo_tool` to insert or update data into a MongoDB collection named after `category`, using the primary key.
                6. If insertion succeeds, call `move_to_category_tool` to move the file to the appropriate folder.
                7. Call `log_summary_tool` to log the results.
                After step 7, output exactly:
                Category: <category>
                Valid: <true/false>
                Ensure a newline character separates 'Category' and 'Valid' lines. Do not include any additional text, explanations, or characters. Stop execution immediately after producing this output. If any step fails, output: Error: <error message>.
                
            """),
            ("human", """
                Analyze this file for ingestion:
                Filename: {filename}
                File path: {file_path}
                Database: {db_name}
                Columns: {columns}
                Execute the steps in sequence as instructed in the system prompt.
                {agent_scratchpad}
            """)
        ])

        agent = create_openai_functions_agent(llm=llm, tools=tools, prompt=prompt)
        agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True, handle_parsing_errors=True, max_iterations=3)

        try:
            start_time = time.time()
            result = agent_executor.invoke({
                "filename": filename,
                "file_path": filepath,
                "db_name": db_name,
                "columns": columns_str,
                "agent_scratchpad": ""
            })
            logger.debug(f"AgentExecutor completed in {time.time() - start_time:.2f}s")
            logger.debug(f"AgentExecutor raw output: {result.get('output', '')}")
            logger.debug(f"Agent scratchpad: {result.get('agent_scratchpad', '')}")

            # Parse output with robust regex
            output = result.get("output", "")
            if "Error:" in output:
                logger.error(f"Agent returned error: {output}")
                raise ValueError(output)
            category_match = re.search(r"Category:\s*([^\n]+?)(?:\n|$)", output)
            valid_match = re.search(r"Valid:\s*(true|false)", output, re.IGNORECASE)
            if not category_match or not valid_match:
                logger.error(f"Failed to parse AgentExecutor output: {output}")
                raise ValueError("Failed to parse agent output")

            category = category_match.group(1).strip()
            valid = valid_match.group(1).strip().lower() == "true"
            logger.debug(f"Parsed category: {category}, valid: {valid}")

            # Verify file was moved
            target_path = os.path.join(ORG_DIR, category, filename)
            if not os.path.exists(target_path):
                logger.error(f"File not found at {target_path}")
                raise RuntimeError(f"File move failed: File not found at {target_path}")

            return {"category": category, "valid": valid}

        except Exception as e:
            logger.error(f"AgentExecutor failed: {str(e)}, falling back to manual workflow")
            return manual_ingest_file(filepath, filename, db_name, columns)

    except Exception as e:
        logger.error(f"Ingestion failed for {filename}: {str(e)}")
        raise

def manual_ingest_file(filepath: str, filename: str, db_name: str, columns: list) -> dict:
    """Fallback manual workflow for ingestion if AgentExecutor fails."""
    logger.info(f"Executing manual ingestion for {filename}")
    try:
        # Step 1: Classify dataset
        category = classify_dataset_tool.invoke({"columns": columns, "db_name": db_name})
        if category.startswith("Error:"):
            logger.error(f"Manual classification failed: {category}")
            raise ValueError(category)
        logger.debug(f"Manual classification: {category}")

        # Step 2: Validate schema
        valid = validate_schema_tool.invoke({"columns": columns, "db_name": db_name, "category": category})
        if not valid:
            logger.error("Manual schema validation failed")
            raise ValueError("Schema validation failed")
        logger.debug(f"Manual schema validation: {valid}")

        # Step 3: Identify primary key
        primary_key = identify_primary_key_tool.invoke({"columns": columns, "db_name": db_name, "category": category})
        if primary_key.startswith("Error:"):
            logger.error(f"Manual primary key identification failed: {primary_key}")
            raise ValueError(primary_key)
        logger.debug(f"Manual primary key: {primary_key}")

        # Step 4: Insert to MongoDB
        insert_result = insert_to_mongo_tool.invoke({
            "filepath": filepath,
            "filename": filename,
            "db_name": db_name,
            "category": category,
            "primary_key": primary_key
        })
        if insert_result.startswith("Error:"):
            logger.error(f"Manual insertion failed: {insert_result}")
            raise ValueError(insert_result)
        logger.debug(f"Manual insertion: {insert_result}")

        # Step 5: Move file
        move_result = move_to_category_tool.invoke({"filepath": filepath, "category": category, "filename": filename})
        if move_result.startswith("Error:"):
            logger.error(f"Manual file move failed: {move_result}")
            raise ValueError(move_result)
        logger.debug(f"Manual file move: {move_result}")

        # Step 6: Log summary
        log_result = log_summary_tool.invoke({"filename": filename, "category": category, "valid": valid})
        if log_result.startswith("Error:"):
            logger.error(f"Manual logging failed: {log_result}")
            raise ValueError(log_result)
        logger.debug(f"Manual logging: {log_result}")

        # Verify file was moved
        target_path = os.path.join(ORG_DIR, category, filename)
        if not os.path.exists(target_path):
            logger.error(f"File not found at {target_path}")
            raise RuntimeError(f"File move failed: File not found at {target_path}")

        return {"category": category, "valid": valid}

    except Exception as e:
        logger.error(f"Manual ingestion failed for {filename}: {str(e)}")
        raise