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

class QueryRAGInput(BaseModel):
    query: str = Field(description="User query to process")
    filename: str = Field(description="Name of the CSV file associated with the vector database")

@tool(args_schema=QueryRAGInput)
def query_rag(query: str, filename: str) -> str:
    """
    Queries the FAISS vector database with the user query and generates a response using the LLM.
    Returns the response as a string.
    """
    logger.debug(f"Processing query '{query}' for {filename}")
    try:
        # Load FAISS index and metadata
        vector_db_path = os.path.join(VECTOR_DB_DIR, f"{os.path.splitext(filename)[0]}_index.faiss")
        metadata_path = os.path.join(VECTOR_DB_DIR, f"{os.path.splitext(filename)[0]}_metadata.pkl")
        if not os.path.exists(vector_db_path) or not os.path.exists(metadata_path):
            logger.error(f"Vector DB or metadata not found for {filename}")
            return f"Error: Vector DB not found for {filename}"

        index = faiss.read_index(vector_db_path)
        with open(metadata_path, 'rb') as f:
            metadata = pickle.load(f)
        texts = metadata['texts']

        # Encode query
        query_embedding = embedder.encode([query], show_progress_bar=False)
        query_embedding = np.array(query_embedding, dtype='float32')

        # Search FAISS index
        k = 5  # Number of nearest neighbors
        distances, indices = index.search(query_embedding, k)
        retrieved_texts = [texts[i] for i in indices[0]]
        context = "\n".join(retrieved_texts)
        logger.debug(f"Retrieved context (first 1000 chars): {context[:1000]}")

        # Generate response using LLM
        llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            temperature=0.7,
            google_api_key=os.getenv("GOOGLE_API_KEY")
        )
        prompt = ChatPromptTemplate.from_messages([
            ("system", """
            You are a helpful chatbot that answers user queries based on provided data context.
            Use the following context to answer the query concisely and accurately:
            {context}
            If the context is insufficient, say so and provide a general answer if possible.
            Return the answer as plain text, no markdown or extra formatting.
            """),
            ("human", "Query: {query}")
        ])
        chain = prompt | llm
        response = chain.invoke({"query": query, "context": context})
        return response.content
    except Exception as e:
        logger.error(f"Error processing query for {filename}: {str(e)}")
        return f"Error: {str(e)}"

def run_rag_agent(filename: str, csv_data: str = None, query: str = None) -> str:
    """
    Runs the RAG agent to either create embeddings or process a query.
    If csv_data is provided, creates embeddings. If query is provided, processes the query.
    Returns the vector DB path or query response.
    """
    logger.info(f"Running RAG agent for {filename}, query: {query}, has_csv: {csv_data is not None}")
    try:
        # Input validation
        if csv_data and query:
            logger.error("Cannot process both CSV data and query simultaneously")
            return "Error: Cannot process both CSV data and query simultaneously"
        if not csv_data and not query:
            logger.error("Must provide either CSV data or a query")
            return "Error: Must provide either CSV data or a query"

        llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            temperature=0.0,
            google_api_key=os.getenv("GOOGLE_API_KEY")
        )
        tools = [create_embeddings, query_rag]
        prompt = ChatPromptTemplate.from_messages([
            ("system", """
            You are a RAG agent that processes CSV data to create embeddings or answers queries using a vector database.
            - If CSV data is provided (non-empty), use the create_embeddings tool to generate and store embeddings, returning the vector DB path.
            - If a query is provided (non-empty), use the query_rag tool to retrieve relevant data and generate a response, returning the response.
            - Do not process both CSV data and a query together.
            - Return the result as a plain string (either the vector DB path or the query response).
            - If the input is invalid, return an error message starting with 'Error: '.
            """),
            ("human", "Filename: {filename}\nCSV Data: {csv_data}\nQuery: {query}\n{agent_scratchpad}")
        ])
        agent = create_openai_functions_agent(llm=llm, tools=tools, prompt=prompt)
        executor = AgentExecutor(
            agent=agent,
            tools=tools,
            verbose=True,
            handle_parsing_errors=True,
            max_iterations=3
        )

        # Normalize inputs to ensure empty strings are handled correctly
        csv_data = csv_data.strip() if csv_data else ""
        query = query.strip() if query else ""

        if csv_data:
            result = executor.invoke({
                "filename": filename,
                "csv_data": csv_data,
                "query": "",
                "agent_scratchpad": ""
            })
            output = result["output"]
            if output.startswith("Error:"):
                logger.error(f"RAG agent failed to create embeddings: {output}")
                return output
            logger.info(f"RAG agent created embeddings: {output}")
            return output
        elif query:
            result = executor.invoke({
                "filename": filename,
                "csv_data": "",
                "query": query,
                "agent_scratchpad": ""
            })
            output = result["output"]
            if output.startswith("Error:"):
                logger.error(f"RAG agent failed to process query: {output}")
                return output
            logger.info(f"RAG agent query response: {output}")
            return output
        else:
            logger.error("Unexpected input state after validation")
            return "Error: Invalid input state"

    except Exception as e:
        logger.error(f"RAG agent error for {filename}: {str(e)}")
        return f"Error: {str(e)}"