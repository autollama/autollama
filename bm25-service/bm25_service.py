#!/usr/bin/env python3
"""
BM25S Ultrafast Indexing Service for AutoLlama
Provides BM25 text indexing capabilities with 500x speedup using scipy sparse matrices
"""

import bm25s
import numpy as np
import json
import os
import pickle
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AutoLlama BM25S Service",
    description="Ultrafast BM25 indexing service for AutoLlama pipeline",
    version="1.0.0"
)

class ChunkData(BaseModel):
    id: str
    text: str
    metadata: Optional[Dict[str, Any]] = {}

class IndexRequest(BaseModel):
    chunks: List[ChunkData]
    filename: str
    replace_existing: bool = True

class SearchRequest(BaseModel):
    query: str
    filename: str
    top_k: int = 10

class BM25Manager:
    def __init__(self, storage_path: str = "/tmp/bm25_indices"):
        self.storage_path = storage_path
        self.indices: Dict[str, Any] = {}  # filename -> BM25 index
        self.metadata: Dict[str, Dict] = {}  # filename -> index metadata
        os.makedirs(storage_path, exist_ok=True)
        logger.info(f"BM25Manager initialized with storage at: {storage_path}")
    
    def _get_index_path(self, filename: str) -> str:
        """Get the file path for storing a BM25 index"""
        safe_filename = filename.replace("/", "_").replace("\\", "_")
        return os.path.join(self.storage_path, f"{safe_filename}.bm25")
    
    def _get_metadata_path(self, filename: str) -> str:
        """Get the file path for storing index metadata"""
        safe_filename = filename.replace("/", "_").replace("\\", "_")
        return os.path.join(self.storage_path, f"{safe_filename}.meta")
    
    async def create_index(self, chunks: List[ChunkData], filename: str, replace_existing: bool = True) -> Dict[str, Any]:
        """Create BM25 index from chunks using ultrafast bm25s library"""
        try:
            start_time = datetime.now()
            
            # Check if index exists and replace_existing is False
            if not replace_existing and filename in self.indices:
                return {
                    "status": "exists",
                    "filename": filename,
                    "chunks": len(chunks),
                    "message": "Index already exists and replace_existing=False"
                }
            
            logger.info(f"Creating BM25 index for {filename} with {len(chunks)} chunks")
            
            # Extract text and prepare corpus
            corpus = [chunk.text for chunk in chunks]
            chunk_ids = [chunk.id for chunk in chunks]
            chunk_metadata = [chunk.metadata for chunk in chunks]
            
            # Tokenize corpus for BM25S
            logger.info("Tokenizing corpus...")
            corpus_tokens = bm25s.tokenize(corpus)
            
            # Create and train BM25 retriever
            logger.info("Creating BM25 retriever...")
            retriever = bm25s.BM25(corpus=corpus_tokens)
            
            # Index the corpus
            logger.info("Indexing corpus...")
            retriever.index(corpus_tokens)
            
            # Store in memory
            self.indices[filename] = retriever
            
            # Store metadata
            index_metadata = {
                "filename": filename,
                "chunk_count": len(chunks),
                "chunk_ids": chunk_ids,
                "chunk_metadata": chunk_metadata,
                "created_at": start_time.isoformat(),
                "corpus_size": len(corpus)
            }
            self.metadata[filename] = index_metadata
            
            # Persist to disk
            await self._save_index_to_disk(filename, retriever, index_metadata)
            
            processing_time = (datetime.now() - start_time).total_seconds()
            
            logger.info(f"BM25 index created for {filename} in {processing_time:.2f}s")
            
            return {
                "status": "indexed",
                "filename": filename,
                "chunks": len(chunks),
                "processing_time_seconds": processing_time,
                "index_size_mb": self._estimate_index_size(retriever),
                "created_at": start_time.isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to create BM25 index for {filename}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to create index: {str(e)}")
    
    async def search_index(self, query: str, filename: str, top_k: int = 10) -> Dict[str, Any]:
        """Search BM25 index for relevant chunks"""
        try:
            if filename not in self.indices:
                # Try to load from disk
                await self._load_index_from_disk(filename)
                
            if filename not in self.indices:
                raise HTTPException(status_code=404, detail=f"Index not found for filename: {filename}")
            
            retriever = self.indices[filename]
            metadata = self.metadata[filename]
            
            # Tokenize query
            query_tokens = bm25s.tokenize([query])
            
            # Search index
            scores, indices = retriever.retrieve(query_tokens, k=top_k)
            
            # Format results
            results = []
            for i, (score, idx) in enumerate(zip(scores[0], indices[0])):
                if idx < len(metadata["chunk_ids"]):
                    results.append({
                        "rank": i + 1,
                        "chunk_id": metadata["chunk_ids"][idx],
                        "score": float(score),
                        "metadata": metadata["chunk_metadata"][idx]
                    })
            
            return {
                "status": "success",
                "query": query,
                "filename": filename,
                "results": results,
                "total_results": len(results)
            }
            
        except Exception as e:
            logger.error(f"Failed to search index for {filename}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
    
    async def _save_index_to_disk(self, filename: str, retriever: Any, metadata: Dict) -> None:
        """Save BM25 index and metadata to disk for persistence"""
        try:
            index_path = self._get_index_path(filename)
            metadata_path = self._get_metadata_path(filename)
            
            # Save retriever object
            with open(index_path, 'wb') as f:
                pickle.dump(retriever, f)
            
            # Save metadata
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
                
            logger.info(f"Saved BM25 index to disk: {index_path}")
            
        except Exception as e:
            logger.warning(f"Failed to save index to disk: {str(e)}")
    
    async def _load_index_from_disk(self, filename: str) -> bool:
        """Load BM25 index and metadata from disk"""
        try:
            index_path = self._get_index_path(filename)
            metadata_path = self._get_metadata_path(filename)
            
            if not os.path.exists(index_path) or not os.path.exists(metadata_path):
                return False
            
            # Load retriever object
            with open(index_path, 'rb') as f:
                retriever = pickle.load(f)
            
            # Load metadata
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            
            self.indices[filename] = retriever
            self.metadata[filename] = metadata
            
            logger.info(f"Loaded BM25 index from disk: {index_path}")
            return True
            
        except Exception as e:
            logger.warning(f"Failed to load index from disk: {str(e)}")
            return False
    
    def _estimate_index_size(self, retriever: Any) -> float:
        """Estimate index size in MB"""
        try:
            # Rough estimation based on corpus size
            return len(str(retriever)) / (1024 * 1024)
        except:
            return 0.0
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about all indices"""
        stats = {
            "total_indices": len(self.indices),
            "indices": {}
        }
        
        for filename, metadata in self.metadata.items():
            stats["indices"][filename] = {
                "chunk_count": metadata.get("chunk_count", 0),
                "created_at": metadata.get("created_at"),
                "corpus_size": metadata.get("corpus_size", 0)
            }
        
        return stats

# Global BM25 manager instance
bm25_manager = BM25Manager()

@app.post("/index/{filename}")
async def create_index(filename: str, request: IndexRequest):
    """Create BM25 index for a file's chunks"""
    return await bm25_manager.create_index(
        chunks=request.chunks,
        filename=filename,
        replace_existing=request.replace_existing
    )

@app.post("/search/{filename}")
async def search_index(filename: str, request: SearchRequest):
    """Search BM25 index for relevant chunks"""
    return await bm25_manager.search_index(
        query=request.query,
        filename=filename,
        top_k=request.top_k
    )

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "autollama-bm25s",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/stats")
async def get_stats():
    """Get statistics about all indices"""
    return bm25_manager.get_stats()

@app.delete("/index/{filename}")
async def delete_index(filename: str):
    """Delete BM25 index for a file"""
    try:
        if filename in bm25_manager.indices:
            del bm25_manager.indices[filename]
        
        if filename in bm25_manager.metadata:
            del bm25_manager.metadata[filename]
        
        # Remove from disk
        index_path = bm25_manager._get_index_path(filename)
        metadata_path = bm25_manager._get_metadata_path(filename)
        
        if os.path.exists(index_path):
            os.remove(index_path)
        if os.path.exists(metadata_path):
            os.remove(metadata_path)
        
        return {"status": "deleted", "filename": filename}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete index: {str(e)}")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3002))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")