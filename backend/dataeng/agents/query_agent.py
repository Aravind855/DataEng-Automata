# query_agent.py
import os
import logging
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
import pickle

# Setup logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Paths
VECTOR_DB_DIR = "vector_db"

# Initialize SentenceTransformer model
try:
    embedder = SentenceTransformer('all-MiniLM-L6-v2')
except Exception as e:
    logger.error(f"Failed to load SentenceTransformer model: {str(e)}")
    raise

def process_query(query: str, filename: str) -> str:
    """
    Processes a user query by searching the FAISS vector database and generating a response using the LLM.
    Returns the response as a string.
    """
    logger.debug(f"Processing query '{query}' for {filename}")
    try:
        # Load FAISS index and metadata
        vector_db_path = os.path.join(VECTOR_DB_DIR, f"{os.path.splitext(filename)[0]}_index.faiss")
        metadata_path = os.path.join(VECTOR_DB_DIR, f"{os.path.splitext(filename)[0]}_metadata.pkl")
        logger.debug(f"Loading FAISS index: {vector_db_path}, metadata: {metadata_path}")
        if not os.path.exists(vector_db_path) or not os.path.exists(metadata_path):
            logger.error(f"Vector DB or metadata not found for {filename}")
            return f"Error: Vector DB not found for {filename}"

        index = faiss.read_index(vector_db_path)
        with open(metadata_path, 'rb') as f:
            metadata = pickle.load(f)
        texts = metadata['texts']
        logger.debug(f"Metadata texts (first 1000 chars): {''.join(texts)[:1000]}")

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
        logger.info(f"Generated response: {response.content}")
        return response.content
    except Exception as e:
        logger.error(f"Error processing query for {filename}: {str(e)}")
        return f"Error: {str(e)}"