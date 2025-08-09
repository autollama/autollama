# AutoLlama API - Python Examples

This guide provides comprehensive Python examples for integrating with the AutoLlama Context Llama API.

## Installation

```bash
pip install requests aiohttp python-multipart
```

## Basic Setup

```python
import requests
import aiohttp
import asyncio
import time
import json
from pathlib import Path
from typing import Dict, List, Optional, Any
from urllib.parse import urljoin

class AutoLlamaClient:
    """
    Python client for AutoLlama Context Llama API
    """
    
    def __init__(self, base_url: str = "http://localhost:8080/api", api_key: Optional[str] = None, timeout: int = 30):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.timeout = timeout
        
        # Setup session with default headers
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'AutoLlama-Python-Client/1.0'
        })
        
        if api_key:
            self.session.headers['Authorization'] = f'Bearer {api_key}'
    
    def _url(self, endpoint: str) -> str:
        """Build full URL for endpoint"""
        return urljoin(self.base_url + '/', endpoint.lstrip('/'))
    
    def _handle_response(self, response: requests.Response) -> Dict[str, Any]:
        """Handle API response and errors"""
        try:
            data = response.json()
        except ValueError:
            data = {'error': {'message': 'Invalid JSON response'}}
        
        if not response.ok:
            error_msg = data.get('error', {}).get('message', f'HTTP {response.status_code}')
            raise AutoLlamaAPIError(error_msg, response.status_code, data)
        
        return data
    
    def health_check(self) -> Dict[str, Any]:
        """Check API health status"""
        response = self.session.get(self._url('/health'), timeout=self.timeout)
        return self._handle_response(response)
    
    def comprehensive_health(self) -> Dict[str, Any]:
        """Get comprehensive health information"""
        response = self.session.get(self._url('/health/comprehensive'), timeout=self.timeout)
        return self._handle_response(response)


class AutoLlamaAPIError(Exception):
    """Custom exception for AutoLlama API errors"""
    
    def __init__(self, message: str, status_code: int = None, response_data: Dict = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_data = response_data
        self.error_code = response_data.get('error', {}).get('code') if response_data else None
```

## Health Checks

```python
def check_api_health():
    """Simple health check example"""
    client = AutoLlamaClient()
    
    try:
        health = client.health_check()
        print(f"API Status: {health['status']}")
        print(f"Uptime: {health['uptime']} seconds")
        return health['success']
    except AutoLlamaAPIError as e:
        print(f"Health check failed: {e}")
        return False

def get_system_status():
    """Get detailed system status"""
    client = AutoLlamaClient()
    
    try:
        status = client.comprehensive_health()
        print("System Status:")
        print(f"  Overall: {status['status']}")
        print(f"  Services:")
        for service, info in status.get('services', {}).items():
            print(f"    {service}: {info['status']} ({info.get('responseTime', 0)}ms)")
        
        return status
    except AutoLlamaAPIError as e:
        print(f"Failed to get system status: {e}")
        return None

# Usage
if check_api_health():
    get_system_status()
```

## Content Processing

```python
class ContentProcessor:
    """Handle content processing operations"""
    
    def __init__(self, client: AutoLlamaClient):
        self.client = client
    
    def process_url(self, url: str, chunk_size: int = 1000, overlap: int = 100, 
                   contextual_embeddings: bool = True) -> Dict[str, Any]:
        """Process URL content synchronously"""
        data = {
            'url': url,
            'chunkSize': chunk_size,
            'overlap': overlap,
            'enableContextualEmbeddings': contextual_embeddings
        }
        
        response = self.client.session.post(
            self.client._url('/process-url'),
            json=data,
            timeout=300  # 5 minutes for processing
        )
        
        return self.client._handle_response(response)
    
    def process_url_streaming(self, url: str, chunk_size: int = 1000, 
                            overlap: int = 100, contextual_embeddings: bool = True) -> Dict[str, Any]:
        """Start URL processing with streaming updates"""
        data = {
            'url': url,
            'chunkSize': chunk_size,
            'overlap': overlap,
            'enableContextualEmbeddings': contextual_embeddings
        }
        
        response = self.client.session.post(
            self.client._url('/process-url-stream'),
            json=data,
            timeout=self.client.timeout
        )
        
        return self.client._handle_response(response)
    
    def process_file(self, file_path: str, chunk_size: int = 1000, 
                    overlap: int = 100, contextual_embeddings: bool = True) -> Dict[str, Any]:
        """Upload and process a file"""
        file_path = Path(file_path)
        
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        # Prepare multipart form data
        files = {
            'file': (file_path.name, open(file_path, 'rb'), 'application/octet-stream')
        }
        
        data = {
            'chunkSize': chunk_size,
            'overlap': overlap,
            'enableContextualEmbeddings': str(contextual_embeddings).lower()
        }
        
        # Remove Content-Type header for multipart requests
        headers = dict(self.client.session.headers)
        headers.pop('Content-Type', None)
        
        try:
            response = self.client.session.post(
                self.client._url('/process-file'),
                files=files,
                data=data,
                headers=headers,
                timeout=300  # 5 minutes for file upload
            )
            
            return self.client._handle_response(response)
        finally:
            files['file'][1].close()
    
    def monitor_processing(self, session_id: str, max_attempts: int = 60, 
                          check_interval: int = 5) -> Dict[str, Any]:
        """Monitor processing progress until completion"""
        attempts = 0
        
        while attempts < max_attempts:
            try:
                response = self.client.session.get(
                    self.client._url(f'/processing/status/{session_id}'),
                    timeout=self.client.timeout
                )
                
                status_data = self.client._handle_response(response)
                session = status_data.get('session', {})
                status = session.get('status')
                progress = status_data.get('progress', 0)
                
                print(f"Progress: {progress}% - Status: {status}")
                
                if status == 'completed':
                    print("Processing completed successfully!")
                    return status_data
                elif status == 'failed':
                    error_msg = session.get('error_message', 'Unknown error')
                    raise AutoLlamaAPIError(f"Processing failed: {error_msg}")
                
                time.sleep(check_interval)
                attempts += 1
                
            except AutoLlamaAPIError as e:
                if e.status_code == 404:
                    raise AutoLlamaAPIError(f"Session {session_id} not found")
                raise
        
        raise TimeoutError("Processing took longer than expected")
    
    def pre_upload_check(self) -> Dict[str, Any]:
        """Check if system is ready for upload"""
        response = self.client.session.post(
            self.client._url('/pre-upload-check'),
            timeout=self.client.timeout
        )
        
        return self.client._handle_response(response)

# Usage examples
client = AutoLlamaClient()
processor = ContentProcessor(client)

# Process URL with monitoring
try:
    # Check system readiness
    check_result = processor.pre_upload_check()
    if not check_result.get('ready', False):
        print("System not ready:", check_result.get('recommendations', []))
    else:
        # Start processing
        result = processor.process_url_streaming(
            'https://example.com/article',
            chunk_size=1200,
            overlap=150
        )
        
        session_id = result['sessionId']
        print(f"Processing started: {session_id}")
        
        # Monitor progress
        final_result = processor.monitor_processing(session_id)
        print("Processing completed:", final_result)

except AutoLlamaAPIError as e:
    print(f"Processing failed: {e}")
except TimeoutError as e:
    print(f"Timeout: {e}")

# Process file
try:
    file_result = processor.process_file(
        './documents/research.pdf',
        chunk_size=800,
        overlap=100
    )
    print("File processed:", file_result['sessionId'])
except FileNotFoundError as e:
    print(f"File error: {e}")
except AutoLlamaAPIError as e:
    print(f"Upload failed: {e}")
```

## Search Operations

```python
class SearchManager:
    """Handle search operations"""
    
    def __init__(self, client: AutoLlamaClient):
        self.client = client
    
    def search(self, query: str, limit: int = 20, offset: int = 0, 
              include_chunks: bool = False, threshold: float = 0.7) -> Dict[str, Any]:
        """Perform hybrid search"""
        params = {
            'q': query,
            'limit': limit,
            'offset': offset,
            'includeChunks': str(include_chunks).lower(),
            'threshold': threshold
        }
        
        response = self.client.session.get(
            self.client._url('/search'),
            params=params,
            timeout=self.client.timeout
        )
        
        return self.client._handle_response(response)
    
    def vector_search(self, query: str, limit: int = 10, threshold: float = 0.7) -> Dict[str, Any]:
        """Perform vector similarity search"""
        data = {
            'query': query,
            'limit': limit,
            'threshold': threshold
        }
        
        response = self.client.session.post(
            self.client._url('/search/vector'),
            json=data,
            timeout=self.client.timeout
        )
        
        return self.client._handle_response(response)
    
    def search_documents(self, query: str, sort_by: str = 'relevance', 
                        sort_order: str = 'desc', limit: int = 20) -> Dict[str, Any]:
        """Search documents by title and content"""
        params = {
            'q': query,
            'sortBy': sort_by,
            'sortOrder': sort_order,
            'limit': limit
        }
        
        response = self.client.session.get(
            self.client._url('/search/documents'),
            params=params,
            timeout=self.client.timeout
        )
        
        return self.client._handle_response(response)
    
    def find_similar_chunks(self, chunk_id: str, limit: int = 10) -> Dict[str, Any]:
        """Find similar chunks to a given chunk"""
        params = {'limit': limit}
        
        response = self.client.session.get(
            self.client._url(f'/search/similar/{chunk_id}'),
            params=params,
            timeout=self.client.timeout
        )
        
        return self.client._handle_response(response)

# Usage examples
client = AutoLlamaClient()
search_manager = SearchManager(client)

# Basic search
try:
    results = search_manager.search(
        'artificial intelligence machine learning',
        limit=10,
        include_chunks=True,
        threshold=0.8
    )
    
    print(f"Found {results['total']} results in {results['processingTime']}ms")
    for i, result in enumerate(results['results'], 1):
        print(f"{i}. {result['title']} (Score: {result['similarity_score']:.3f})")
        if result.get('contextual_summary'):
            print(f"   Summary: {result['contextual_summary']}")

except AutoLlamaAPIError as e:
    print(f"Search failed: {e}")

# Vector search
try:
    vector_results = search_manager.vector_search(
        'neural networks deep learning',
        limit=5,
        threshold=0.85
    )
    
    print(f"Vector search found {len(vector_results['results'])} results")
    for result in vector_results['results']:
        content = result['content']
        print(f"Score: {result['score']:.3f} - {content.get('title', 'Untitled')}")

except AutoLlamaAPIError as e:
    print(f"Vector search failed: {e}")
```

## Document Management

```python
class DocumentManager:
    """Handle document management operations"""
    
    def __init__(self, client: AutoLlamaClient):
        self.client = client
    
    def list_documents(self, page: int = 1, limit: int = 20, search: str = None,
                      sort_by: str = 'created_at', sort_order: str = 'desc') -> Dict[str, Any]:
        """Get paginated list of documents"""
        params = {
            'page': page,
            'limit': limit,
            'sortBy': sort_by,
            'sortOrder': sort_order
        }
        
        if search:
            params['search'] = search
        
        response = self.client.session.get(
            self.client._url('/documents'),
            params=params,
            timeout=self.client.timeout
        )
        
        return self.client._handle_response(response)
    
    def get_document(self, document_id: str, chunk_limit: int = 50, 
                    chunk_offset: int = 0) -> Dict[str, Any]:
        """Get document details with chunks"""
        params = {
            'chunkLimit': chunk_limit,
            'chunkOffset': chunk_offset
        }
        
        response = self.client.session.get(
            self.client._url(f'/documents/{document_id}'),
            params=params,
            timeout=self.client.timeout
        )
        
        return self.client._handle_response(response)
    
    def update_document(self, document_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update document metadata"""
        response = self.client.session.put(
            self.client._url(f'/documents/{document_id}'),
            json=updates,
            timeout=self.client.timeout
        )
        
        return self.client._handle_response(response)
    
    def delete_document(self, document_id: str) -> Dict[str, Any]:
        """Delete document and all associated data"""
        response = self.client.session.delete(
            self.client._url(f'/documents/{document_id}'),
            timeout=self.client.timeout
        )
        
        return self.client._handle_response(response)
    
    def get_document_chunks(self, document_id: str, page: int = 1, limit: int = 20,
                           include_embeddings: bool = False, search: str = None) -> Dict[str, Any]:
        """Get document chunks with pagination"""
        params = {
            'page': page,
            'limit': limit,
            'includeEmbeddings': str(include_embeddings).lower()
        }
        
        if search:
            params['search'] = search
        
        response = self.client.session.get(
            self.client._url(f'/documents/{document_id}/chunks'),
            params=params,
            timeout=self.client.timeout
        )
        
        return self.client._handle_response(response)
    
    def get_document_stats(self, document_id: str) -> Dict[str, Any]:
        """Get document processing statistics"""
        response = self.client.session.get(
            self.client._url(f'/documents/{document_id}/stats'),
            timeout=self.client.timeout
        )
        
        return self.client._handle_response(response)
    
    def reprocess_document(self, document_id: str, chunk_size: int = None,
                          overlap: int = None, contextual_embeddings: bool = None) -> Dict[str, Any]:
        """Trigger document reprocessing"""
        data = {}
        if chunk_size is not None:
            data['chunkSize'] = chunk_size
        if overlap is not None:
            data['overlap'] = overlap
        if contextual_embeddings is not None:
            data['enableContextualEmbeddings'] = contextual_embeddings
        
        response = self.client.session.post(
            self.client._url(f'/documents/{document_id}/reprocess'),
            json=data,
            timeout=self.client.timeout
        )
        
        return self.client._handle_response(response)

# Usage examples
client = AutoLlamaClient()
doc_manager = DocumentManager(client)

# List documents
try:
    documents = doc_manager.list_documents(page=1, limit=10, search='research')
    print(f"Found {len(documents['documents'])} documents")
    
    for doc in documents['documents']:
        print(f"- {doc['title']} ({doc['chunk_count']} chunks)")
        print(f"  Created: {doc['created_at']}")
        print(f"  Status: {doc['status']}")

except AutoLlamaAPIError as e:
    print(f"Failed to list documents: {e}")

# Get document details
try:
    doc_id = "your-document-id-here"
    doc_details = doc_manager.get_document(doc_id, chunk_limit=20)
    
    document = doc_details['document']
    chunks = doc_details['chunks']
    
    print(f"Document: {document['title']}")
    print(f"Chunks returned: {len(chunks)}")
    
    for chunk in chunks[:5]:  # Show first 5 chunks
        print(f"- Chunk {chunk['chunk_index']}: {chunk['chunk_text'][:100]}...")

except AutoLlamaAPIError as e:
    print(f"Failed to get document: {e}")

# Update document
try:
    doc_id = "your-document-id-here"
    updates = {
        'title': 'Updated Document Title',
        'metadata': {
            'category': 'research',
            'tags': ['ai', 'machine-learning'],
            'priority': 'high'
        }
    }
    
    result = doc_manager.update_document(doc_id, updates)
    print("Document updated successfully")

except AutoLlamaAPIError as e:
    print(f"Failed to update document: {e}")

# Get document statistics
try:
    doc_id = "your-document-id-here"
    stats = doc_manager.get_document_stats(doc_id)['stats']
    
    print(f"Document Statistics:")
    print(f"  Total Chunks: {stats['totalChunks']}")
    print(f"  Completed: {stats['completedChunks']}")
    print(f"  Failed: {stats['failedChunks']}")
    print(f"  Average Chunk Size: {stats['avgChunkSize']}")
    print(f"  Processing Time: {stats['processingTime']}ms")
    
    # Sentiment distribution
    sentiment = stats['sentimentDistribution']
    print(f"  Sentiment: {sentiment['positive']} positive, {sentiment['neutral']} neutral, {sentiment['negative']} negative")

except AutoLlamaAPIError as e:
    print(f"Failed to get document stats: {e}")
```

## Async Operations

```python
import aiohttp
import asyncio

class AsyncAutoLlamaClient:
    """Async version of AutoLlama client"""
    
    def __init__(self, base_url: str = "http://localhost:8080/api", 
                 api_key: Optional[str] = None, timeout: int = 30):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        
        self.headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'AutoLlama-Python-AsyncClient/1.0'
        }
        
        if api_key:
            self.headers['Authorization'] = f'Bearer {api_key}'
    
    def _url(self, endpoint: str) -> str:
        return urljoin(self.base_url + '/', endpoint.lstrip('/'))
    
    async def _handle_response(self, response: aiohttp.ClientResponse) -> Dict[str, Any]:
        """Handle async response"""
        try:
            data = await response.json()
        except ValueError:
            data = {'error': {'message': 'Invalid JSON response'}}
        
        if not response.ok:
            error_msg = data.get('error', {}).get('message', f'HTTP {response.status}')
            raise AutoLlamaAPIError(error_msg, response.status, data)
        
        return data
    
    async def search_async(self, query: str, limit: int = 20) -> Dict[str, Any]:
        """Async search operation"""
        params = {
            'q': query,
            'limit': limit
        }
        
        async with aiohttp.ClientSession(
            headers=self.headers, 
            timeout=self.timeout
        ) as session:
            async with session.get(self._url('/search'), params=params) as response:
                return await self._handle_response(response)
    
    async def process_multiple_urls(self, urls: List[str]) -> List[Dict[str, Any]]:
        """Process multiple URLs concurrently"""
        async def process_single_url(session, url):
            data = {
                'url': url,
                'chunkSize': 1000,
                'enableContextualEmbeddings': True
            }
            
            async with session.post(self._url('/process-url-stream'), json=data) as response:
                return await self._handle_response(response)
        
        async with aiohttp.ClientSession(
            headers=self.headers,
            timeout=self.timeout
        ) as session:
            tasks = [process_single_url(session, url) for url in urls]
            return await asyncio.gather(*tasks)

# Async usage example
async def main():
    client = AsyncAutoLlamaClient()
    
    # Concurrent searches
    search_tasks = [
        client.search_async('artificial intelligence', limit=10),
        client.search_async('machine learning', limit=10),
        client.search_async('neural networks', limit=10)
    ]
    
    results = await asyncio.gather(*search_tasks)
    
    for i, result in enumerate(results):
        print(f"Search {i+1}: {result['total']} results")
    
    # Process multiple URLs
    urls = [
        'https://example.com/article1',
        'https://example.com/article2',
        'https://example.com/article3'
    ]
    
    processing_results = await client.process_multiple_urls(urls)
    
    for i, result in enumerate(processing_results):
        print(f"URL {i+1} processing started: {result['sessionId']}")

# Run async example
if __name__ == "__main__":
    asyncio.run(main())
```

## Error Handling and Retry Logic

```python
import time
import random
from functools import wraps

def retry_with_backoff(max_retries: int = 3, base_delay: float = 1.0, 
                      backoff_multiplier: float = 2.0, jitter: bool = True):
    """Decorator for retry logic with exponential backoff"""
    
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except AutoLlamaAPIError as e:
                    last_exception = e
                    
                    # Don't retry client errors (4xx)
                    if e.status_code and 400 <= e.status_code < 500:
                        if e.status_code != 429:  # Except rate limiting
                            raise
                    
                    if attempt == max_retries:
                        break
                    
                    # Calculate delay with exponential backoff
                    delay = base_delay * (backoff_multiplier ** attempt)
                    
                    # Add jitter to prevent thundering herd
                    if jitter:
                        delay += random.uniform(0, delay * 0.1)
                    
                    print(f"Request failed (attempt {attempt + 1}/{max_retries + 1}), retrying in {delay:.2f}s...")
                    time.sleep(delay)
                
                except Exception as e:
                    # Don't retry non-API errors
                    raise
            
            raise last_exception
        
        return wrapper
    return decorator

class RobustAutoLlamaClient(AutoLlamaClient):
    """AutoLlama client with built-in retry logic"""
    
    @retry_with_backoff(max_retries=3, base_delay=1.0)
    def robust_search(self, query: str, **kwargs) -> Dict[str, Any]:
        """Search with automatic retry on failures"""
        search_manager = SearchManager(self)
        return search_manager.search(query, **kwargs)
    
    @retry_with_backoff(max_retries=2, base_delay=2.0)
    def robust_process_url(self, url: str, **kwargs) -> Dict[str, Any]:
        """Process URL with retry logic"""
        processor = ContentProcessor(self)
        return processor.process_url(url, **kwargs)

# Usage with error handling
def safe_api_operation():
    client = RobustAutoLlamaClient()
    
    try:
        # This will automatically retry on failures
        results = client.robust_search('artificial intelligence', limit=10)
        print(f"Search successful: {results['total']} results")
        
    except AutoLlamaAPIError as e:
        if e.status_code == 429:
            print("Rate limited - please try again later")
        elif e.status_code == 503:
            print("Service temporarily unavailable")
        else:
            print(f"API error: {e} (Code: {e.error_code})")
    
    except Exception as e:
        print(f"Unexpected error: {e}")

safe_api_operation()
```

## Complete Usage Example

```python
#!/usr/bin/env python3
"""
Complete example demonstrating AutoLlama API usage
"""

def main():
    # Initialize client
    client = AutoLlamaClient(
        base_url="http://localhost:8080/api",
        api_key=None,  # Set if authentication is enabled
        timeout=60
    )
    
    # Initialize managers
    processor = ContentProcessor(client)
    search_manager = SearchManager(client)
    doc_manager = DocumentManager(client)
    
    try:
        # 1. Check system health
        print("1. Checking system health...")
        health = client.health_check()
        if not health['success']:
            print("System is not healthy, aborting.")
            return
        
        # 2. Process a document
        print("2. Processing URL...")
        url = "https://example.com/research-article"
        
        # Check readiness first
        check = processor.pre_upload_check()
        if not check.get('ready', False):
            print("System not ready for upload")
            return
        
        # Start processing
        result = processor.process_url_streaming(url, chunk_size=1200)
        session_id = result['sessionId']
        print(f"Processing started: {session_id}")
        
        # Monitor progress
        final_result = processor.monitor_processing(session_id)
        print("Processing completed successfully!")
        
        # 3. Search for content
        print("3. Searching for content...")
        search_results = search_manager.search(
            'artificial intelligence research',
            limit=5,
            include_chunks=True
        )
        
        print(f"Found {search_results['total']} results:")
        for i, result in enumerate(search_results['results'], 1):
            print(f"{i}. {result['title']} (Score: {result['similarity_score']:.3f})")
        
        # 4. List documents
        print("4. Listing recent documents...")
        documents = doc_manager.list_documents(limit=5)
        
        for doc in documents['documents']:
            print(f"- {doc['title']} ({doc['chunk_count']} chunks)")
            
            # Get stats for first document
            if doc == documents['documents'][0]:
                stats = doc_manager.get_document_stats(doc['document_id'])
                print(f"  Stats: {stats['stats']['totalChunks']} chunks, "
                      f"{stats['stats']['processingTime']}ms processing time")
        
        print("Example completed successfully!")
        
    except AutoLlamaAPIError as e:
        print(f"API Error: {e}")
        if e.error_code:
            print(f"Error Code: {e.error_code}")
    
    except Exception as e:
        print(f"Unexpected error: {e}")

if __name__ == "__main__":
    main()
```

This comprehensive Python guide covers all major API operations with robust error handling, retry logic, and both synchronous and asynchronous usage patterns.