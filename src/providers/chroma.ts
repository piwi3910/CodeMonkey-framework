import { ChromaClient, Collection, OpenAIEmbeddingFunction, QueryResponse, Metadata } from 'chromadb';
import { config } from '../config/env';

interface Document {
  id: string;
  content: string;
  metadata: Record<string, any>;
}

type CollectionName = 'code' | 'memory' | 'documentation';

export class ChromaProvider {
  private client: ChromaClient;
  private embedder: OpenAIEmbeddingFunction;
  private collections: Map<CollectionName, Collection> = new Map();

  constructor() {
    const url = `http${config.chromadb.tls ? 's' : ''}://${config.chromadb.host}:${config.chromadb.port}`;
    const options: { path: string; auth?: { provider: string; credentials: string } } = { path: url };

    if (config.chromadb.apiKey) {
      options.auth = {
        provider: 'token',
        credentials: config.chromadb.apiKey,
      };
    }

    this.client = new ChromaClient(options);

    if (!config.llm.openai.apiKey) {
      throw new Error('OpenAI API key is required for embeddings');
    }

    this.embedder = new OpenAIEmbeddingFunction({
      openai_api_key: config.llm.openai.apiKey,
      openai_model: "text-embedding-3-small"
    });
  }

  async initialize(): Promise<void> {
    // Initialize default collections
    await this.getCollection('code');
    await this.getCollection('memory');
    await this.getCollection('documentation');
  }

  private async getCollection(name: CollectionName): Promise<Collection> {
    if (this.collections.has(name)) {
      return this.collections.get(name)!;
    }

    const collection = await this.client.getOrCreateCollection({
      name,
      embeddingFunction: this.embedder,
    });

    this.collections.set(name, collection);
    return collection;
  }

  async addDocuments(
    collectionName: CollectionName,
    documents: Document[]
  ): Promise<void> {
    const collection = await this.getCollection(collectionName);

    await collection.add({
      ids: documents.map((doc) => doc.id),
      documents: documents.map((doc) => doc.content),
      metadatas: documents.map((doc) => doc.metadata),
    });
  }

  async queryDocuments(
    collectionName: CollectionName,
    query: string,
    options: {
      nResults?: number;
      where?: Record<string, any>;
    } = {}
  ): Promise<Document[]> {
    const collection = await this.getCollection(collectionName);
    const { nResults = 5, where } = options;

    const results = await collection.query({
      queryTexts: [query],
      nResults,
      where,
    });

    return this.processQueryResults(results);
  }

  private processQueryResults(results: QueryResponse): Document[] {
    if (!results.documents?.[0] || !results.metadatas?.[0] || !results.ids?.[0]) {
      return [];
    }

    const documents = results.documents[0];
    const metadatas = results.metadatas[0];
    const ids = results.ids[0];

    if (!Array.isArray(documents) || !Array.isArray(metadatas) || !Array.isArray(ids)) {
      return [];
    }

    return documents.map((content: string | null, index: number) => ({
      id: ids[index],
      content: content || '',
      metadata: metadatas[index] || {},
    }));
  }

  async addCodeDocument(
    code: string,
    metadata: {
      filePath: string;
      language: string;
      projectId: string;
      taskId?: string;
    }
  ): Promise<void> {
    await this.addDocuments('code', [
      {
        id: `${metadata.projectId}-${metadata.filePath}`,
        content: code,
        metadata,
      },
    ]);
  }

  async findSimilarCode(
    query: string,
    options: {
      projectId: string;
      language?: string;
      nResults?: number;
    }
  ): Promise<Document[]> {
    const where: Record<string, any> = {
      projectId: options.projectId,
    };

    if (options.language) {
      where.language = options.language;
    }

    return this.queryDocuments('code', query, {
      nResults: options.nResults,
      where,
    });
  }

  async addMemory(
    content: string,
    metadata: {
      agentId: string;
      projectId: string;
      type: 'shortTerm' | 'longTerm';
      timestamp: string;
    }
  ): Promise<void> {
    await this.addDocuments('memory', [
      {
        id: `${metadata.agentId}-${metadata.timestamp}`,
        content,
        metadata,
      },
    ]);
  }

  async findRelevantMemories(
    query: string,
    options: {
      agentId: string;
      projectId: string;
      type?: 'shortTerm' | 'longTerm';
      nResults?: number;
    }
  ): Promise<Document[]> {
    const where: Record<string, any> = {
      agentId: options.agentId,
      projectId: options.projectId,
    };

    if (options.type) {
      where.type = options.type;
    }

    return this.queryDocuments('memory', query, {
      nResults: options.nResults,
      where,
    });
  }

  async addDocumentation(
    content: string,
    metadata: {
      projectId: string;
      type: 'api' | 'architecture' | 'technical' | 'design';
      title: string;
      timestamp: string;
    }
  ): Promise<void> {
    await this.addDocuments('documentation', [
      {
        id: `${metadata.projectId}-${metadata.type}-${metadata.timestamp}`,
        content,
        metadata,
      },
    ]);
  }

  async findRelevantDocumentation(
    query: string,
    options: {
      projectId: string;
      type?: 'api' | 'architecture' | 'technical' | 'design';
      nResults?: number;
    }
  ): Promise<Document[]> {
    const where: Record<string, any> = {
      projectId: options.projectId,
    };

    if (options.type) {
      where.type = options.type;
    }

    return this.queryDocuments('documentation', query, {
      nResults: options.nResults,
      where,
    });
  }

  async deleteCollection(name: CollectionName): Promise<void> {
    await this.client.deleteCollection({ name });
    this.collections.delete(name);
  }

  async reset(): Promise<void> {
    for (const [name] of this.collections) {
      await this.deleteCollection(name);
    }
    await this.initialize();
  }
}