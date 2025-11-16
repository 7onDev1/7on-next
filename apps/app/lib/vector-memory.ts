// apps/app/lib/vector-memory.ts - FIXED: Proper pool configuration with timeouts
import { Pool, PoolClient } from 'pg';

interface VectorMemoryConfig {
  connectionString: string;
  ollamaUrl?: string;
}

export class VectorMemory {
  private pool: Pool;
  private ollamaUrl: string;
  private embeddingModel: string = 'nomic-embed-text'; // 768 dimensions

  constructor(config: VectorMemoryConfig) {
    this.pool = new Pool({
      connectionString: config.connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      // ✅ Set timeouts at pool level
      statement_timeout: 10000, // 10s
      query_timeout: 15000, // 15s
    });
    
    this.pool.on('error', (err) => {
      console.error('❌ Postgres pool error:', err);
    });
    
    this.ollamaUrl = config.ollamaUrl || process.env.OLLAMA_EXTERNAL_URL || process.env.OLLAMA_URL || 'http://ollama.internal:11434';
    console.log('🔗 Ollama URL:', this.ollamaUrl.replace(/\/\/.+@/, '//*****@'));
  }

  async connect() {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      console.log('✅ VectorMemory pool ready');
    } finally {
      client.release();
    }
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

  async addMemory(userId: string, content: string, metadata?: any) {
    const client = await this.pool.connect();
    try {
      console.log(`🧠 Adding memory for user ${userId}...`);
      
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid user_id');
      }
      
      const embedding = await this.generateEmbedding(content);
      
      if (embedding.length !== 768) {
        throw new Error(`Invalid embedding dimension: ${embedding.length}, expected 768`);
      }
      
      const vectorString = `[${embedding.join(',')}]`;
      
      const result = await client.query(
        `INSERT INTO user_data_schema.memory_embeddings 
         (user_id, content, embedding, metadata) 
         VALUES ($1, $2, $3::vector, $4)
         RETURNING id, created_at`,
        [userId, content, vectorString, JSON.stringify(metadata || {})]
      );

      console.log(`✅ Memory added with ID: ${result.rows[0].id}`);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async searchMemories(userId: string, query: string, limit = 10) {
    const client = await this.pool.connect();
    try {
      console.log(`🔍 Semantic search for user ${userId}: "${query}"`);
      
      const queryEmbedding = await this.generateEmbedding(query);
      const vectorString = `[${queryEmbedding.join(',')}]`;
      
      const result = await client.query(
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

      return result.rows.map((row: any) => ({
        id: row.id,
        content: row.content,
        metadata: row.metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
        user_id: row.user_id,
        score: parseFloat(row.score),
      }));
    } finally {
      client.release();
    }
  }

  async getAllMemories(userId: string) {
    const client = await this.pool.connect();
    try {
      console.log(`📋 Fetching all memories for user ${userId}`);
      
      const result = await client.query(
        `SELECT 
          id::text as id,
          content, 
          metadata, 
          created_at,
          updated_at,
          user_id
         FROM user_data_schema.memory_embeddings 
         WHERE user_id = $1 
         ORDER BY created_at DESC
         LIMIT 100`,
        [userId]
      );
      
      console.log(`✅ Found ${result.rows.length} memories`);
      
      return result.rows.map((row: any) => ({
        id: row.id,
        content: row.content,
        metadata: row.metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
        user_id: row.user_id,
      }));
    } finally {
      client.release();
    }
  }

  async deleteMemory(memoryId: string, userId?: string) {
    const client = await this.pool.connect();
    try {
      console.log(`🗑️  Deleting memory ${memoryId}${userId ? ` for user ${userId}` : ''}`);
      
      const query = userId
        ? `DELETE FROM user_data_schema.memory_embeddings WHERE id = $1 AND user_id = $2 RETURNING id`
        : `DELETE FROM user_data_schema.memory_embeddings WHERE id = $1 RETURNING id`;
      
      const params = userId ? [memoryId, userId] : [memoryId];
      
      const result = await client.query(query, params);
      
      if (result.rowCount === 0) {
        throw new Error('Memory not found or access denied');
      }
      
      console.log(`✅ Memory deleted`);
    } finally {
      client.release();
    }
  }

  async getUserContext(userId: string, query?: string, limit = 5) {
    if (query) {
      return await this.searchMemories(userId, query, limit);
    }
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(
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
    } finally {
      client.release();
    }
  }

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
    await this.pool.end();
  }
}

// ✅ Singleton pattern with proper pool
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
