import os
import logging
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from groq import Groq
from sentence_transformers import SentenceTransformer
import chromadb
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# --- LOGGING CONFIGURATION ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
PERSIST_DIRECTORY = "./local_chroma_db"
EMBEDDING_MODEL_NAME = "BAAI/bge-small-en-v1.5"
GROQ_MODEL_NAME = "openai/gpt-oss-20b"  # Using a recommended model for chat
COLLECTION_NAMES = ["local_docs_collection"]

# --- DATABASE ABSTRACTION CLASS (Unchanged) ---
class VectorDatabase:
    """A class to handle all interactions with the ChromaDB multi-collection setup."""
    def __init__(self, path: str, collection_names: list[str]):
        logger.info(f"Loading vector database from '{path}'...")
        try:
            self.client = chromadb.PersistentClient(path=path)
            self.collections = []
            for name in collection_names:
                try:
                    collection = self.client.get_collection(name)
                    self.collections.append(collection)
                    logger.info(f"✅ Collection '{name}' loaded successfully with {collection.count()} documents.")
                except Exception as e:
                    logger.error(f"❌ FAILED to load collection '{name}'. It will be skipped. Error: {e}")
        except Exception as e:
            logger.critical(f"❌ Could not initialize ChromaDB client at path '{path}'. Error: {e}")
            self.client = None
            self.collections = []

    def is_ready(self) -> bool:
        """Check if any collections were loaded successfully."""
        return len(self.collections) > 0

    def query(self, query_embedding: list[float], n_results: int = 5) -> dict:
        """Searches all loaded collections and returns combined, re-ranked results."""
        if not self.is_ready():
            return {"documents": [], "metadatas": [], "distances": []}
            
        all_results = []
        for collection in self.collections:
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=n_results,
                include=['documents', 'metadatas', 'distances']
            )
            
            num_retrieved = len(results['ids'][0])
            for i in range(num_retrieved):
                all_results.append({
                    "distance": results['distances'][0][i],
                    "document": results['documents'][0][i],
                    "metadata": results['metadatas'][0][i]
                })
        
        all_results.sort(key=lambda item: item['distance'])
        
        top_documents = [item['document'] for item in all_results[:n_results]]
        top_metadatas = [item['metadata'] for item in all_results[:n_results]]
        top_distances = [item['distance'] for item in all_results[:n_results]]
        
        return {"documents": top_documents, "metadatas": top_metadatas, "distances": top_distances}

# --- INITIALIZE SERVICES ---
app = FastAPI(title="Legal RAG API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

logger.info("Loading embedding model...")
embedding_model = None
try:
    embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME, device='cpu')
    logger.info("✅ Embedding model loaded successfully")
except Exception as e:
    logger.critical(f"❌ Failed to load embedding model: {e}. The API cannot function.")
    embedding_model = None # Ensure it's None if loading fails

vector_db = VectorDatabase(path=PERSIST_DIRECTORY, collection_names=COLLECTION_NAMES)

try:
    groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    USE_GROQ = True
    logger.info("✅ Groq client initialized successfully")
except Exception as e:
    USE_GROQ = False
    logger.warning(f"⚠ Groq client initialization failed: {e}. AI responses will be unavailable.")

# --- Pydantic Models for API ---
class Query(BaseModel):
    question: str

class Answer(BaseModel):
    answer: str

# --- AI RESPONSE FUNCTION (Slightly adjusted for correctness) ---
async def get_ai_response(question: str) -> str:
    """Get AI response using the RAG system"""
    if embedding_model is None or not vector_db.is_ready():
        raise HTTPException(status_code=503, detail="AI system is not ready. Check model and DB loading.")

    try:
        question_embedding = embedding_model.encode(question).tolist()
        search_results = vector_db.query(query_embedding=question_embedding, n_results=5)
        
        context_chunks = search_results["documents"]

        if not context_chunks:
            return "I'm sorry, I could not find any relevant information for your question in the legal knowledge base."

        context = "\n\n---\n\n".join(context_chunks)
        
        if USE_GROQ:
            prompt = f"""Disclaimer: I am an AI assistant and not a lawyer. The information provided is for informational purposes only and does not constitute legal advice. You should consult with a qualified legal professional for any legal issues.**

---

You are an expert legal assistant specializing in Indian law, with knowledge of the Indian Penal Code (IPC), Bharatiya Nyaya Sanhita (BNS), and other statutes. Your task is to answer the user's question based strictly on the legal 'CONTEXT' provided. Also, provide a simple, blank First Information Report (FIR) template for the user to understand its structure.

*Instructions:*
1.  *Identity:* If asked who you are, introduce yourself as 'LawBot', an AI legal information assistant.
2.  *Strictly Context-Based:* Base your answer exclusively on the provided 'CONTEXT'. Do not invent sections, penalties, or legal interpretations.
3.  *Out of Context:* If the answer is not in the 'CONTEXT', state clearly that the provided legal documents do not contain information on that topic.
4.  *Handling Negativity:* If the user expresses negative opinions, respond politely and neutrally.
5.  *FIR Template:* After answering the user's question, provide a clearly marked, generic FIR template.

---
*CONTEXT:*
{context}

---
*USER QUESTION:* {question}

*ANSWER:*
"""

            completion = groq_client.chat.completions.create(
                model=GROQ_MODEL_NAME,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=2048
            )
            answer = completion.choices[0].message.content
            answer += f"\n\n*Source: Information retrieved from {len(context_chunks)} relevant legal document sections.*"
            return answer
        else:
            return "The primary AI service is unavailable. Cannot generate a response."

    except Exception as e:
        logger.error(f"Error in get_ai_response: {e}")
        raise HTTPException(status_code=500, detail="An error occurred while processing your request.")


# --- CORE API ENDPOINT ---
@app.post("/api/query", response_model=Answer)
async def process_query(query: Query):
    """
    Receives a question, gets a RAG-based answer, and returns it.
    This is a stateless endpoint.
    """
    if not query.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    
    try:
        response_text = await get_ai_response(query.question)
        return Answer(answer=response_text)
    except HTTPException as e:
        # Re-raise HTTP exceptions to let FastAPI handle them
        raise e
    except Exception as e:
        logger.exception(f"An unexpected error occurred at the query endpoint for question: '{query.question}'")
        raise HTTPException(status_code=500, detail="A critical error occurred.")

if __name__ == "__main__":
    import uvicorn
    logger.info("RAG API is ready to receive requests at http://127.0.0.1:8003")
    uvicorn.run(app, host="127.0.0.1", port=8003)