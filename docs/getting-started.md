# Getting Started

This guide walks you through setting up AutoLlama on your machine.

## Prerequisites

- Linux, macOS, or Windows with WSL
- Docker and Docker Compose
- At least 4GB of RAM and 10GB of free disk space

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/snedea/autollama.git
   cd autollama
   ```
2. Copy the example environment file and adjust settings as needed:
   ```bash
   cp example.env .env
   ```
3. Start the stack:
   ```bash
   docker compose up -d
   ```
4. Verify the services are healthy:
   ```bash
   curl http://localhost:7734/health
   ```

## Next Steps

- Upload documents through the UI or API.
- Explore advanced configuration in the `config` directory.
- Join the community on GitHub for support and contributions.
