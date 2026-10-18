"""
Python Reference Implementation of RAG Pipeline for Voice-Agent Platform

Pipeline Flow:
  PDF -> Extract Full Text -> Split into Chunks -> Generate Embeddings -> 
  Store Chunks + Embeddings in Supabase -> Retrieve Relevant Chunks -> Send Chunks to LLM

Imports:
  1. sentence-transformers / all-MiniLM-L6-v2 (384-dimensional dense vectors)
  2. from supabase import create_client
  3. from langchain.text_splitter import RecursiveCharacterTextSplitter, CharacterTextSplitter
  4. from langchain_core.documents import Document
"""

import os
import sys
from typing import List, Dict, Any

# Required imports
try:
    from supabase import create_client, Client
except ImportError:
    create_client = None

try:
    from langchain.text_splitter import RecursiveCharacterTextSplitter, CharacterTextSplitter
    from langchain_core.documents import Document
except ImportError:
    RecursiveCharacterTextSplitter = None
    CharacterTextSplitter = None
    Document = None

try:
    from sentence_transformers import SentenceTransformer
    from langchain_community.embeddings import HuggingFaceEmbeddings
except ImportError:
    SentenceTransformer = None
    HuggingFaceEmbeddings = None


class VoiceAgentRAGPipeline:
    def __init__(self, supabase_url: str = None, supabase_key: str = None):
        self.url = supabase_url or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        self.key = supabase_key or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        
        if self.url and self.key and create_client:
            self.supabase: Client = create_client(self.url, self.key)
        else:
            self.supabase = None

        # Sentence-transformers embedding model (384 dimensions)
        self.model_name = "sentence-transformers/all-MiniLM-L6-v2"
        if HuggingFaceEmbeddings:
            self.embeddings = HuggingFaceEmbeddings(model_name=self.model_name)
        elif SentenceTransformer:
            self.model = SentenceTransformer(self.model_name)
        else:
            self.embeddings = None

        # Text splitter (Recursive chunking preserving tables & prices)
        if RecursiveCharacterTextSplitter:
            self.text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=800,
                chunk_overlap=100,
                separators=["\n\n", "\n", " ", ""]
            )
        elif CharacterTextSplitter:
            self.text_splitter = CharacterTextSplitter(
                chunk_size=800,
                chunk_overlap=100,
                separator="\n\n"
            )
        else:
            self.text_splitter = None

    def extract_text_from_pdf(self, pdf_file_path: str) -> str:
        """
        Step 1: Extract full text from PDF
        """
        try:
            from pypdf import PdfReader
            reader = PdfReader(pdf_file_path)
            pages_text = []
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    pages_text.append(text)
            full_text = "\n\n".join(pages_text)
            return full_text.strip()
        except ImportError:
            # Fallback if pypdf is not installed
            print("Note: pypdf not installed. Install via: pip install pypdf")
            return ""

    def ingest_document(
        self,
        full_text: str,
        document_name: str,
        business_id: str,
        ai_employee_id: str,
        source_type: str = "document_upload"
    ) -> Dict[str, Any]:
        """
        Full RAG ingestion:
          Full Text -> Split into Chunks -> Generate 384-dim Embeddings -> Store in Supabase
        """
        print(f"Ingesting '{document_name}' for AI Employee {ai_employee_id}...")
        
        # 1. Clean and normalize text
        clean_text = full_text.replace("\r\n", "\n").strip()
        if not clean_text:
            return {"status": "error", "message": "Document text is empty"}

        # 2. Split into chunks
        if self.text_splitter and Document:
            raw_doc = Document(
                page_content=clean_text,
                metadata={
                    "source_type": source_type,
                    "document_name": document_name,
                    "ai_employee_id": ai_employee_id,
                    "business_id": business_id,
                }
            )
            chunks: List[Document] = self.text_splitter.split_documents([raw_doc])
        else:
            # Simple fallback splitting
            chunk_size = 800
            overlap = 100
            chunks = []
            i = 0
            while i < len(clean_text):
                chunks.append(clean_text[i:i + chunk_size])
                i += chunk_size - overlap

        print(f"Split document into {len(chunks)} full text chunks.")

        if not self.supabase:
            return {"status": "mock_success", "chunks_count": len(chunks)}

        # 3. Insert record in knowledge_documents
        doc_res = self.supabase.table("knowledge_documents").insert({
            "business_id": business_id,
            "ai_employee_id": ai_employee_id,
            "name": document_name,
            "source_type": source_type,
            "raw_text": clean_text,
            "metadata": {"chunk_count": len(chunks)}
        }).execute()

        document_id = doc_res.data[0]["id"] if doc_res.data else None

        # 4. Generate embeddings and store each chunk in knowledge_chunks
        chunk_rows = []
        for i, chunk in enumerate(chunks):
            content = chunk.page_content if hasattr(chunk, 'page_content') else str(chunk)
            if self.embeddings:
                emb = self.embeddings.embed_query(content)
            elif SentenceTransformer:
                emb = self.model.encode(content).tolist()
            else:
                emb = [0.0] * 384

            chunk_rows.append({
                "document_id": document_id,
                "business_id": business_id,
                "ai_employee_id": ai_employee_id,
                "chunk_index": i,
                "content": content,
                "embedding": emb,
                "metadata": {"chunk_index": i, "source": document_name}
            })

        self.supabase.table("knowledge_chunks").insert(chunk_rows).execute()
        print(f"Successfully stored {len(chunk_rows)} vector chunks in Supabase 'knowledge_chunks'.")
        return {"status": "indexed", "document_id": document_id, "chunks_count": len(chunk_rows)}

    def retrieve_relevant_chunks(
        self,
        query: str,
        ai_employee_id: str,
        top_k: int = 4
    ) -> List[Dict[str, Any]]:
        """
        Step 5: Retrieve relevant chunks matching the query using vector similarity
        """
        if not self.supabase:
            return []

        # Generate query embedding
        if self.embeddings:
            query_vec = self.embeddings.embed_query(query)
        elif SentenceTransformer:
            query_vec = self.model.encode(query).tolist()
        else:
            query_vec = [0.0] * 384

        # Execute Supabase match RPC
        response = self.supabase.rpc(
            "match_knowledge_chunks",
            {
                "query_embedding": query_vec,
                "match_threshold": 0.1,
                "match_count": top_k,
                "filter_employee_id": ai_employee_id,
            }
        ).execute()

        return response.data or []


if __name__ == "__main__":
    print("Voice-Agent RAG Pipeline Initialized.")
    print("Architecture:")
    print("  PDF -> Extract full text -> Split into chunks -> Generate embeddings -> Store chunks + embeddings in Supabase -> Retrieve relevant chunks -> Send retrieved chunks to LLM")
