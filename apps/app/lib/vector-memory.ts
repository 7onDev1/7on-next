// apps/app/lib/vector-memory.ts
import { Client } from 'pg';

interface VectorMemoryConfig {
  connectionString: string;
  ollamaUrl?: string;
}

export class VectorMemory {
  private client: Client;
  private ollamaUrl: string;
  private embeddingModel: string = 'nomic-embed-text'; // 768 dimensions

  constructor(config: VectorMemoryConfig) {
    this.client = new Client({ connectionString: config.connectionString });
    this.ollamaUrl = config.ollamaUrl || process.env.OLLAMA_EXTERNAL_URL || process.env.OLLAMA_URL || 'http://ollama.internal:11434';
    console.log('🔗 Ollama URL:', this.ollamaUrl.replace(/\/\/.+@/, '//*****@'));
  }

  async connect() {
    await this.client.connect();
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embeddingModel,
          prompt: text,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }
      
      return data.embedding;
    } catch (error) {
      console.error('❌ Error generating embedding:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
          throw new Error(`Cannot reach Ollama at ${this.ollamaUrl}. Make sure Ollama service has external access enabled.`);
        }
        if (error.message.includes('ETIMEDOUT') || error.message.includes('timeout')) {
          throw new Error(`Ollama request timeout. Service might be starting or overloaded.`);
        }
      }
      
      throw new Error(`Ollama connection failed: ${(error as Error).message}`);
    }
  }

  /**
   * ✅ FIXED: Add memory with proper user_id
   */
  async addMemory(userId: string, content: string, metadata?: any) {
    try {
      console.log(`🧠 Adding memory for user ${userId}...`);
      
      // Validate user_id
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid user_id');
      }
      
      // Generate embedding
      const embedding = await this.generateEmbedding(content);
      
      if (embedding.length !== 768) {
        throw new Error(`Invalid embedding dimension: ${embedding.length}, expected 768`);
      }
      
      const vectorString = `[${embedding.join(',')}]`;
      
      // ✅ Store with user_id
      const result = await this.client.query(
        `INSERT INTO user_data_schema.memory_embeddings 
         (user_id, content, embedding, metadata) 
         VALUES ($1, $2, $3::vector, $4)
         RETURNING id, created_at`,
        [userId, content, vectorString, JSON.stringify(metadata || {})]
      );

      console.log(`✅ Memory added with ID: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error adding memory:', error);
      throw error;
    }
  }

  /**
   * ✅ FIXED: Search with proper user_id filter
   */
  async searchMemories(userId: string, query: string, limit = 10) {
    try {
      console.log(`🔍 Semantic search for user ${userId}: "${query}"`);
      
      const queryEmbedding = await this.generateEmbedding(query);
      const vectorString = `[${queryEmbedding.join(',')}]`;
      
      // ✅ Filter by user_id
      const result = await this.client.query(
        `SELECT 
          id::text as id,
          content, 
          metadata, 
          created_at,
          updated_at,
          user_id,
          1 - (embedding <=> $1::vector) as score
         FROM user_data_schema.memory_embeddings
         WHERE user_id = $2
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        [vectorString, userId, limit]
      );

      console.log(`✅ Found ${result.rows.length} memories`);

      return result.rows.map(row => ({
        id: row.id,
        content: row.content,
        metadata: row.metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
        user_id: row.user_id,
        score: parseFloat(row.score),
      }));
    } catch (error) {
      console.error('❌ Semantic search error:', error);
      throw error;
    }
  }

  /**
   * ✅ FIXED: Get all memories with proper user_id filter
   */
  async getAllMemories(userId: string) {
    console.log(`📋 Fetching all memories for user ${userId}`);
    
    const result = await this.client.query(
      `SELECT 
        id::text as id,
        content, 
        metadata, 
        created_at,
        updated_at,
        user_id
       FROM user_data_schema.memory_embeddings 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
    
    console.log(`✅ Found ${result.rows.length} memories`);
    
    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      metadata: row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at,
      user_id: row.user_id,
    }));
  }

  /**
   * ✅ FIXED: Delete with user_id verification
   */
  async deleteMemory(memoryId: string, userId?: string) {
    console.log(`🗑️  Deleting memory ${memoryId}${userId ? ` for user ${userId}` : ''}`);
    
    // Build query with optional user_id check for security
    const query = userId
      ? `DELETE FROM user_data_schema.memory_embeddings WHERE id = $1 AND user_id = $2 RETURNING id`
      : `DELETE FROM user_data_schema.memory_embeddings WHERE id = $1 RETURNING id`;
    
    const params = userId ? [memoryId, userId] : [memoryId];
    
    const result = await this.client.query(query, params);
    
    if (result.rowCount === 0) {
      throw new Error('Memory not found or access denied');
    }
    
    console.log(`✅ Memory deleted`);
  }

  /**
   * Get user context for AI
   */
  async getUserContext(userId: string, query?: string, limit = 5) {
    if (query) {
      return await this.searchMemories(userId, query, limit);
    } else {
      const result = await this.client.query(
        `SELECT 
          id::text as id,
          content, 
          metadata, 
          created_at
         FROM user_data_schema.memory_embeddings 
         WHERE user_id = $1 
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit]
      );
      return result.rows;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async close() {
    await this.client.end();
  }
}

// Singleton instances
const instances = new Map<string, VectorMemory>();

export async function getVectorMemory(connectionString: string, ollamaUrl?: string): Promise<VectorMemory> {
  const cacheKey = `${connectionString}:${ollamaUrl || 'default'}`;
  
  if (!instances.has(cacheKey)) {
    const instance = new VectorMemory({ connectionString, ollamaUrl });
    await instance.connect();
    instances.set(cacheKey, instance);
  }
  return instances.get(cacheKey)!;
}