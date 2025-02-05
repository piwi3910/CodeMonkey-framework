# CodeMonkey Framework

An agentic framework for AI-powered software development teams. CodeMonkey provides a multi-agent system that can collaborate on software development tasks using various LLM providers.

## Features

- 🤖 Multiple specialized agent roles:
  - Project Manager
  - Architect
  - Frontend Developer
  - Backend Developer
  - Code Reviewer
  - DevOps Engineer
  - QA Engineer

- 🔄 OpenAI-compatible API endpoint
  - Drop-in replacement for OpenAI's chat completion API
  - Support for streaming responses
  - Function calling capabilities

- 🧠 Advanced context management
  - Persistent memory across sessions
  - Short-term and long-term memory
  - Project-wide context sharing
  - Vector-based semantic search (via ChromaDB)

- 🔌 Multiple LLM Provider Support
  - Claude (Anthropic)
  - OpenAI
  - OpenRouter
  - Local models (via Ollama)

- 📦 Robust Infrastructure
  - SQLite/PostgreSQL for relational data
  - Redis for caching
  - ChromaDB for vector storage
  - Express.js API server

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- Redis server
- ChromaDB server
- SQLite (development) or PostgreSQL (production)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/codemonkey-framework.git
cd codemonkey-framework
```

2. Install dependencies:
```bash
npm install
```

3. Copy the example environment file and configure your settings:
```bash
cp .env.example .env
```

4. Set up the database:
```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Start the development server:
```bash
npm run dev
```

### Configuration

Edit the .env file to configure:

- Database connection
- Redis connection
- ChromaDB settings
- LLM provider API keys
- Server settings
- Security settings

## Usage

### Creating a New Project

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Project",
    "description": "A new software project"
  }'
```

### Interacting with Agents

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -H "X-Project-Id: your-project-id" \
  -H "X-Agent-Role: architect" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Design a system architecture for a real-time chat application"
      }
    ]
  }'
```

### Creating Tasks

```bash
curl -X POST http://localhost:3000/api/projects/your-project-id/tasks \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implement authentication system",
    "description": "Create a secure authentication system using JWT",
    "priority": "high"
  }'
```

## Architecture

The framework follows a modular architecture with these key components:

- **Agent System**: Specialized agents with different roles and responsibilities
- **Memory Management**: Short-term and long-term memory systems
- **Context Management**: Project-wide context sharing and persistence
- **Task Coordination**: Task creation, assignment, and tracking
- **API Layer**: OpenAI-compatible API and internal endpoints

For more details, see [architecture.md](architecture.md).

## Development

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Building

```bash
npm run build
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Anthropic's Claude for advanced language capabilities
- OpenAI for API design inspiration
- The open-source community for various tools and libraries

## Support

For support, please open an issue in the GitHub repository or contact the maintainers.