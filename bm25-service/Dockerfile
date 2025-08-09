FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY bm25_service.py .

# Create directory for BM25 indices
RUN mkdir -p /app/data/bm25_indices

# Set environment variables
ENV PYTHONPATH=/app
ENV PORT=3002

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:3002/health')"

# Run the application
CMD ["python", "bm25_service.py"]