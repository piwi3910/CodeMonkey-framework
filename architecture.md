# CodeMonkey Framework Architecture

## Overview
CodeMonkey is an agentic framework for creating AI-powered software development teams. It supports multiple LLM providers, maintains persistent context, and exposes an OpenAI-compatible API for interaction.

## Core Components

### 1. Agent System

#### Agent Types
- Project Manager: Oversees projects, assigns tasks, tracks progress
- Architect: System design, technical decisions, architecture planning
- Frontend Developer: UI/UX implementation
- Backend Developer: Server-side logic, API development
- Code Reviewer: Code quality, best practices, security review
- DevOps: Infrastructure, deployment, CI/CD
- QA Engineer: Testing, bug verification, quality assurance

#### Agent Coordination
- **Hierarchical Structure**
  - Project Manager at top level
  - Architect and Tech Lead as second tier
  - Specialized developers as execution tier
- **Parallel Execution**
  - Multiple agents can work simultaneously on different tasks
  - Coordination through shared context and message passing
  - Lock mechanism to prevent conflicts

### 2. LLM Integration

#### Supported Providers
- Claude (Anthropic)
- OpenAI
- OpenRouter
- Ollama (Local Models)

#### Provider Interface
```typescript
interface LLMProvider {
  id: string;
  name: string;
  type: 'cloud' | 'local';
  config: ProviderConfig;
  chat(messages: Message[], options: ChatOptions): Promise<ChatResponse>;
  stream(messages: Message[], options: ChatOptions): AsyncIterator<ChatResponse>;
}
```

### 3. Storage Layer

#### Database Structure (Prisma ORM)
- SQLite for development/small deployments
- PostgreSQL for production/larger deployments

**Key Tables:**
- Projects
- Agents
- Conversations
- Messages
- Files
- Tasks
- CodeChanges
- AgentStates

#### Vector Storage (ChromaDB)
- Code embeddings
- Documentation embeddings
- Conversation embeddings
- Semantic search capabilities

#### Caching (Redis)
- Agent state caching
- Conversation context caching
- Rate limiting
- Task queue management

### 4. API Layer

#### OpenAI-Compatible Endpoint
- Full compatibility with OpenAI chat completion API
- Support for streaming responses
- Function calling capability
- System messages and chat history

#### Internal APIs
- Agent Management API
- Project Management API
- Context Management API
- File Management API
- Task Management API

### 5. Context Management

#### Persistent Context
- Conversation history
- Project state
- Code understanding
- Agent memory
- Task tracking

#### Context Types
- Short-term (Redis)
- Long-term (SQL + Vector DB)
- Code context (Vector DB)
- Project context (SQL + Vector DB)

## Implementation Strategy

### Phase 1: Core Infrastructure
1. Set up Node.js project with TypeScript
2. Implement database layer with Prisma
3. Set up ChromaDB and Redis
4. Create basic agent system
5. Implement Claude integration

### Phase 2: Agent System
1. Implement core agent types
2. Create agent coordination system
3. Develop message passing system
4. Implement context management

### Phase 3: API Layer
1. Create OpenAI-compatible endpoint
2. Implement streaming support
3. Add function calling
4. Develop internal APIs

### Phase 4: Additional LLM Support
1. Add OpenAI integration
2. Implement OpenRouter support
3. Add Ollama integration
4. Create provider management system

### Phase 5: Advanced Features
1. Implement advanced context management
2. Add code analysis capabilities
3. Create project management features
4. Develop monitoring and logging

## Technical Stack

### Backend
- Node.js with TypeScript
- Express.js for API server
- Prisma as ORM
- SQLite/PostgreSQL for relational data
- ChromaDB for vector storage
- Redis for caching

### Development Tools
- Jest for testing
- ESLint + Prettier for code quality
- TypeDoc for documentation
- Docker for containerization
- GitHub Actions for CI/CD

## Security Considerations

### Authentication & Authorization
- API key authentication
- Role-based access control
- Rate limiting
- Request validation

### Data Security
- Encryption at rest
- Secure credential storage
- Audit logging
- Regular security scanning

## Monitoring & Observability

### Metrics
- Agent performance metrics
- API response times
- Error rates
- Resource utilization

### Logging
- Structured logging
- Agent interaction logs
- Error tracking
- Audit trails

## Future Considerations

### Scalability
- Horizontal scaling of API layer
- Database sharding
- Distributed caching
- Load balancing

### Extensibility
- Plugin system for new agent types
- Custom LLM provider integration
- Workflow customization
- Tool integration framework