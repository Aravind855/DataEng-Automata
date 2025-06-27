# rag_agent.py
import os
import pandas as pd
import logging
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic.v1 import BaseModel, Field
import pickle
import io

# Setup logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Paths
CLEAN_DIR = "transformed_datas"
VECTOR_DB_DIR = "vector_db"
os.makedirs(VECTOR_DB_DIR, exist_ok=True)

# Initialize SentenceTransformer model
try:
    embedder = SentenceTransformer('all-MiniLM-L6-v2')
except Exception as e:
    logger.error(f"Failed to load SentenceTransformer model: {str(e)}")
    raise

class CreateEmbeddingsInput(BaseModel):
    filename: str = Field(description="Name of the CSV file to process")
    csv_data: str = Field(description="Raw CSV data as a string")

@tool(args_schema=CreateEmbeddingsInput)
def create_embeddings(filename: str, csv_data: str) -> str:
    """
    Converts CSV data into embeddings using all-MiniLM-L6-v2 and stores them in a FAISS index.
    Returns the path to the saved FAISS index.
    """
    logger.debug(f"Creating embeddings for {filename}")
    try:
        # Read CSV data
        df = pd.read_csv(io.StringIO(csv_data))
        if df.empty:
            logger.error(f"Empty dataset for {filename}")
            return f"Error: Empty dataset for {filename}"

        # Combine relevant columns for embedding (e.g., all columns as text)
        text_data = df.astype(str).agg(' '.join, axis=1).tolist()
        logger.debug(f"Text data for embedding (first 1000 chars): {''.join(text_data)[:1000]}")

        # Generate embeddings
        embeddings = embedder.encode(text_data, show_progress_bar=True)
        embeddings = np.array(embeddings, dtype='float32')
        logger.debug(f"Generated embeddings shape: {embeddings.shape}")

        # Create FAISS index
        dimension = embeddings.shape[1]
        index = faiss.IndexFlatL2(dimension)
        index.add(embeddings)

        # Save FAISS index and metadata
        vector_db_path = os.path.join(VECTOR_DB_DIR, f"{os.path.splitext(filename)[0]}_index.faiss")
        faiss.write_index(index, vector_db_path)
        metadata_path = os.path.join(VECTOR_DB_DIR, f"{os.path.splitext(filename)[0]}_metadata.pkl")
        with open(metadata_path, 'wb') as f:
            pickle.dump({'texts': text_data, 'filename': filename}, f)

        logger.info(f"Saved FAISS index to {vector_db_path}")
        return vector_db_path
    except Exception as e:
        logger.error(f"Error creating embeddings for {filename}: {str(e)}")
        return f"Error: {str(e)}"

def run_rag_agent(filename: str, csv_data: str) -> str:
    """
    Runs the RAG agent to create embeddings from CSV data.
    Returns the vector DB path.
    """
    logger.info(f"Running RAG agent for {filename}, has_csv: {bool(csv_data)}")
    try:
        # Input validation
        if not csv_data:
            logger.error("No CSV data provided")
            return "Error: No CSV data provided"

        llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            temperature=0.0,
            google_api_key=os.getenv("GOOGLE_API_KEY")
        )
        tools = [create_embeddings]
        prompt = ChatPromptTemplate.from_messages([
            ("system", """
            You are a RAG agent that processes CSV data to create embeddings.
            - Use the create_embeddings tool to generate and store embeddings, returning the vector DB path.
            - Return the result as a plain string (the vector DB path).
            - If the input is invalid, return an error message starting with 'Error: '.
            """),
            ("human", "Filename: {filename}\nCSV Data: {csv_data}\n{agent_scratchpad}")
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
        output = result["output"]
        if output.startswith("Error:"):
            logger.error(f"RAG agent failed: {output}")
            return output
        logger.info(f"RAG agent result: {output}")
        return output

    except Exception as e:
        logger.error(f"RAG agent error for {filename}: {str(e)}")
        return f"Error: {str(e)}"