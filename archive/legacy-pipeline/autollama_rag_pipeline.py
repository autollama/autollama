"""
title: AutoLlama RAG Pipeline
author: AutoLlama.io
date: 2025-07-25
version: 1.0
license: MIT
description: A RAG pipeline that connects to AutoLlama's Qdrant vector database to provide semantic search across processed content.
requirements: qdrant-client, openai, python-dotenv
"""

from typing import List, Union, Generator, Iterator, Dict, Any
import os
import json
import asyncio
from datetime import datetime
from pydantic import BaseModel

try:
    from qdrant_client import QdrantClient
    from qdrant_client.http import models
    import openai
    from openai import OpenAI
except ImportError as e:
    print(f"Missing required packages: {e}")
    print("Please install: pip install qdrant-client openai python-dotenv")

class Pipeline:
    class Valves(BaseModel):
        QDRANT_URL: str = "https://c4c8ee46-d9dd-4c0f-a00e-9215675351da.us-west-1-0.aws.cloud.qdrant.io"
        QDRANT_API_KEY: str = "[QDRANT_API_KEY_REMOVED]"
        OPENAI_API_KEY: str = ""  # User needs to set their OpenAI API key
        COLLECTION_NAME: str = "autollama-content"
        MAX_RESULTS: int = 5
        SIMILARITY_THRESHOLD: float = 0.7
        ENABLE_METADATA_FILTERING: bool = True
        DEBUG_MODE: bool = False

    def __init__(self):
        self.name = "AutoLlama RAG Pipeline"
        self.valves = self.Valves()
        self.qdrant_client = None
        self.openai_client = None

    async def on_startup(self):
        """Initialize connections when the pipeline starts"""
        print(f"🚀 Starting {self.name}")
        try:
            # Initialize Qdrant client
            self.qdrant_client = QdrantClient(
                url=self.valves.QDRANT_URL,
                api_key=self.valves.QDRANT_API_KEY,
                timeout=30
            )
            
            # Test Qdrant connection
            collections = await asyncio.get_event_loop().run_in_executor(
                None, self.qdrant_client.get_collections
            )
            print(f"✅ Connected to Qdrant - Collections: {[c.name for c in collections.collections]}")
            
            # Initialize OpenAI client
            if self.valves.OPENAI_API_KEY:
                self.openai_client = OpenAI(api_key=self.valves.OPENAI_API_KEY)
                print("✅ OpenAI client initialized")
            else:
                print("⚠️  OpenAI API key not set - embeddings will not work")
                
        except Exception as e:
            print(f"❌ Error during startup: {str(e)}")

    async def on_shutdown(self):
        """Cleanup when the pipeline shuts down"""
        print(f"🛑 Shutting down {self.name}")
        if self.qdrant_client:
            self.qdrant_client.close()

    async def on_valves_updated(self):
        """Reinitialize when configuration is updated"""
        print("🔄 Configuration updated, reinitializing...")
        await self.on_startup()

    def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for the given text using OpenAI"""
        if not self.openai_client:
            raise Exception("OpenAI client not initialized. Please set OPENAI_API_KEY.")
        
        try:
            response = self.openai_client.embeddings.create(
                model="text-embedding-3-small",
                input=text.strip()[:8000]  # Limit input length
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"Error generating embedding: {str(e)}")
            raise

    def search_knowledge_base(self, query: str, limit: int = None) -> List[Dict[str, Any]]:
        """Search the AutoLlama knowledge base using vector similarity"""
        if not self.qdrant_client:
            raise Exception("Qdrant client not initialized")
        
        limit = limit or self.valves.MAX_RESULTS
        
        try:
            # Generate embedding for the query
            query_embedding = self.generate_embedding(query)
            
            # Search in Qdrant
            search_results = self.qdrant_client.search(
                collection_name=self.valves.COLLECTION_NAME,
                query_vector=query_embedding,
                limit=limit,
                score_threshold=self.valves.SIMILARITY_THRESHOLD,
                with_payload=True
            )
            
            # Format results
            formatted_results = []
            for result in search_results:
                payload = result.payload
                formatted_results.append({
                    'content': payload.get('chunk_text', ''),
                    'title': payload.get('title', 'Untitled'),
                    'url': payload.get('url', ''),
                    'summary': payload.get('summary', ''),
                    'category': payload.get('category', ''),
                    'tags': payload.get('tags', []),
                    'score': float(result.score),
                    'chunk_index': payload.get('chunk_index', 0),
                    'processed_date': payload.get('processed_date', '')
                })
            
            if self.valves.DEBUG_MODE:
                print(f"🔍 Found {len(formatted_results)} results for query: {query[:100]}...")
            
            return formatted_results
            
        except Exception as e:
            print(f"Error searching knowledge base: {str(e)}")
            return []

    def format_rag_context(self, results: List[Dict[str, Any]], query: str) -> str:
        """Format search results into context for the LLM"""
        if not results:
            return f"No relevant information found in the AutoLlama knowledge base for: {query}"
        
        context_parts = []
        context_parts.append("📚 **AutoLlama Knowledge Base Results:**\n")
        
        for i, result in enumerate(results, 1):
            score_percentage = int(result['score'] * 100)
            context_parts.append(f"**Source {i}** (Relevance: {score_percentage}%)")
            context_parts.append(f"**Title:** {result['title']}")
            context_parts.append(f"**URL:** {result['url']}")
            
            if result['category']:
                context_parts.append(f"**Category:** {result['category']}")
            
            if result['tags']:
                tags_str = ', '.join(result['tags']) if isinstance(result['tags'], list) else str(result['tags'])
                context_parts.append(f"**Tags:** {tags_str}")
            
            context_parts.append(f"**Content:** {result['content']}")
            
            if result['summary']:
                context_parts.append(f"**Summary:** {result['summary']}")
                
            context_parts.append("---")
        
        context_parts.append("\n🤖 **Instructions:** Use the above information to answer the user's question. Always cite your sources with the provided URLs. If the information doesn't fully answer the question, mention what's available and suggest the user might need additional sources.")
        
        return "\n\n".join(context_parts)

    def pipe(
        self, 
        user_message: str, 
        model_id: str, 
        messages: List[dict], 
        body: dict
    ) -> Union[str, Generator, Iterator]:
        """Main pipeline logic - performs RAG using AutoLlama knowledge base"""
        
        # Skip processing for title generation or system messages
        if body.get("title", False) or not user_message.strip():
            return user_message
        
        try:
            # Search the knowledge base
            search_results = self.search_knowledge_base(user_message)
            
            if not search_results:
                return f"I searched your AutoLlama knowledge base but couldn't find relevant information for: '{user_message}'. You may want to process more content through AutoLlama or try a different query."
            
            # Format the context
            rag_context = self.format_rag_context(search_results, user_message)
            
            # Add context to the conversation
            enhanced_message = f"{rag_context}\n\n**User Question:** {user_message}"
            
            # Update the last message with enhanced content
            if messages and len(messages) > 0:
                messages[-1]["content"] = enhanced_message
            
            if self.valves.DEBUG_MODE:
                print(f"🔄 Enhanced query with {len(search_results)} knowledge base results")
            
            # Return the enhanced message for the LLM to process
            return enhanced_message
            
        except Exception as e:
            error_msg = f"Error in AutoLlama RAG Pipeline: {str(e)}"
            print(f"❌ {error_msg}")
            return f"I encountered an error while searching your AutoLlama knowledge base: {error_msg}\n\nOriginal question: {user_message}"

    async def inlet(self, body: dict, user: dict) -> dict:
        """Pre-process the request if needed"""
        return body

    async def outlet(self, body: dict, user: dict) -> dict:
        """Post-process the response if needed"""
        return body