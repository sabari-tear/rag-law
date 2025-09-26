import os
import pickle
import argparse
from pathlib import Path
import json
import pandas as pd
import numpy as np
from tqdm import tqdm
from langchain_community.docstore.document import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
import chromadb
import re

# --- CONFIGURATION ---
DATA_DIRECTORY = "dataset"
CHROMA_DB_PATH = "local_chroma_db"
EMBEDDING_MODEL_NAME = "BAAI/bge-small-en-v1.5"
EMBED_BATCH_SIZE = 128
DB_BATCH_SIZE = 5000 
CHUNK_SIZE = 1500
CHUNK_OVERLAP = 200

# --- Caching Utility Functions (Unchanged) ---
def save_pickle(obj, path):
    with open(path, "wb") as f:
        pickle.dump(obj, f)

def load_pickle(path):
    with open(path, "rb") as f:
        return pickle.load(f)

# --- NEW: Custom Parsers for Your Specific Files ---

def clean_text(text):
    """A helper function to clean up text strings."""
    if not isinstance(text, str):
        return ""
    # Remove unicode escape sequences and extra whitespace
    text = re.sub(r'\\u2014', '—', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def parse_json_recursively(data, context=""):
    """Recursively parses the complex JSON structure to extract text chunks with context."""
    chunks = []
    if isinstance(data, dict):
        # Build context from current level
        new_context = context
        part_id = data.get("ID", "")
        part_name = data.get("Name", "")
        heading = data.get("heading", "")

        if part_id or part_name:
            new_context += f" >> {clean_text(part_id)} {clean_text(part_name)}".strip()
        if heading:
            new_context += f" >> Section {clean_text(heading)}"

        # If there's text content at this level, add it
        if "text" in data and isinstance(data['text'], str):
            text_content = clean_text(data['text'])
            if text_content:
                chunks.append(f"{new_context} >> {text_content}")

        # Recurse into nested structures
        for key, value in data.items():
            if key not in ["ID", "Name", "heading", "text"]:
                 chunks.extend(parse_json_recursively(value, new_context))

    elif isinstance(data, list):
        for item in data:
            chunks.extend(parse_json_recursively(item, context))
            
    elif isinstance(data, str):
        text_content = clean_text(data)
        if text_content:
            chunks.append(f"{context} >> {text_content}")
            
    return chunks

def parse_csv_file(file_path):
    """Parses the structured CSV file to create meaningful text chunks."""
    chunks = []
    try:
        df = pd.read_csv(file_path)
        # Clean column names by stripping whitespace
        df.columns = df.columns.str.strip()
        
        for _, row in df.iterrows():
            context = (
                f"Chapter {row.get('Chapter', '')}: {row.get('Chapter_name', '')} >> "
                f"Section {row.get('Section', '')}: {row.get('Section _name', '')}"
            )
            description = clean_text(row.get('Description', ''))
            
            if description:
                full_text = f"{context} >> {description}"
                chunks.append(full_text)
    except Exception as e:
        print(f"Error processing CSV file {file_path}: {e}")
    return chunks

def load_documents_from_folder(directory_path):
    """Loads and parses all JSON and CSV files from a directory using custom parsers."""
    all_docs = []
    folder = Path(directory_path)
    
    for file_path in tqdm(list(folder.rglob("*")), desc="Processing files"):
        # skip directories; only process files
        if not file_path.is_file():
            continue

        suffix = file_path.suffix.lower()
        if suffix == '.json':
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                act_title = data.get("Act Title", file_path.stem)
                text_chunks = parse_json_recursively(data.get("Parts", {}), context=act_title)

                for chunk in text_chunks:
                    all_docs.append(Document(page_content=chunk, metadata={"source": str(file_path)}))
            except Exception as e:
                print(f"Error processing JSON file {file_path}: {e}")

        elif suffix == '.csv':
            try:
                text_chunks = parse_csv_file(file_path)
                for chunk in text_chunks:
                    all_docs.append(Document(page_content=chunk, metadata={"source": str(file_path)}))
            except Exception as e:
                print(f"Error processing CSV file {file_path}: {e}")

    return all_docs


# --- Main Pipeline (Largely Unchanged) ---
def main():
    parser = argparse.ArgumentParser(description="Load local files, create embeddings, and store in a local ChromaDB.")
    parser.add_argument("--reset", action="store_true", help="Reset the database by deleting the collection before starting.")
    args = parser.parse_args()

    docs_cache = "loaded_docs.pkl"
    if os.path.exists(docs_cache):
        all_documents = load_pickle(docs_cache)
        print(f"✅ Loaded {len(all_documents)} cached documents.")
    else:
        print("Step 1: Loading and parsing documents from folder...")
        all_documents = load_documents_from_folder(DATA_DIRECTORY)
        save_pickle(all_documents, docs_cache)
        print(f"✅ Parsed and saved {len(all_documents)} documents to cache.")

    if not all_documents:
        print("❌ No documents were loaded. Please check your data folder and file structures. Exiting.")
        return

    chunks_cache = "chunks.pkl"
    if os.path.exists(chunks_cache):
        chunks = load_pickle(chunks_cache)
        print(f"✅ Loaded {len(chunks)} cached chunks.")
    else:
        print("\nStep 2: Splitting documents into chunks...")
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
        chunks = text_splitter.split_documents(all_documents)
        save_pickle(chunks, chunks_cache)
    
    if not chunks:
        print("❌ No chunks were created. This might mean the source documents are empty or the parser failed. Exiting.")
        return
        
    print(f"✅ Split into {len(chunks)} text chunks.")

    print("\nStep 3: Creating embeddings and storing in ChromaDB...")
    db_client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
    collection_name = "local_docs_collection"

    if args.reset:
        print(f"⚠ --reset flag specified. Deleting collection '{collection_name}'...")
        try:
            db_client.delete_collection(name=collection_name)
            print("✅ Collection deleted.")
        except Exception as e:
            print(f"Collection likely didn't exist. Error: {e}")

    vector_db = db_client.get_or_create_collection(collection_name)

    embeddings_cache = "embeddings.npy"
    if os.path.exists(embeddings_cache):
        print("✅ Loading cached embeddings from file...")
        all_embeddings = np.load(embeddings_cache)
    else:
        print("⚙ Generating and caching embeddings...")
        embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME, device="cuda")
        all_texts = [doc.page_content for doc in chunks]
        all_embeddings = embedding_model.encode(
            all_texts,
            batch_size=EMBED_BATCH_SIZE,
            show_progress_bar=True,
            convert_to_numpy=True
        )
        print("💾 Saving embeddings to cache file...")
        np.save(embeddings_cache, all_embeddings)

    existing_ids = set(vector_db.get(include=[])['ids'])
    print(f"🔄 Vector DB has {len(existing_ids)} documents.")
    
    docs_to_add_indices = [i for i, _ in enumerate(chunks) if str(i) not in existing_ids]

    if not docs_to_add_indices:
        print("✅ Vector DB is already up-to-date.")
    else:
        print(f"➕ Adding {len(docs_to_add_indices)} new documents to the vector DB...")
        for i in tqdm(range(0, len(docs_to_add_indices), DB_BATCH_SIZE), desc="Adding to DB"):
            batch_indices = docs_to_add_indices[i:i + DB_BATCH_SIZE]
            
            batch_ids = [str(idx) for idx in batch_indices]
            batch_docs = [chunks[idx].page_content for idx in batch_indices]
            batch_metadatas = [chunks[idx].metadata for idx in batch_indices]
            batch_embeddings = all_embeddings[batch_indices]

            vector_db.add(
                ids=batch_ids,
                documents=batch_docs,
                metadatas=batch_metadatas,
                embeddings=batch_embeddings.tolist()
            )

    print(f"\n🎉🚀 All done! Your vector database is complete with {vector_db.count()} documents.")

if __name__ == "__main__":
    main()