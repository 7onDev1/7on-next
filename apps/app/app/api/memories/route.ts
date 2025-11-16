// apps/app/app/api/memories/route.ts - FIXED: Proper connection pool with timeouts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import { Pool } from 'pg';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const GATING_SERVICE_URL = process.env.GATING_SERVICE_URL || 'http://gating-service.internal:8080';

// ✅ Connection pool with proper timeout settings
const connectionPools = new Map<string, Pool>();

function getPool(connectionString: string): Pool {
  if (!connectionPools.has(connectionString)) {
    const pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      // ✅ Set query timeout at pool level
      statement_timeout: 10000, // 10s - database will cancel queries
      query_timeout: 15000, // 15s - client will stop waiting
    });
    
    pool.on('error', (err) => {
      console.error('❌ Postgres pool error:', err);
    });
    
    connectionPools.set(connectionString, pool);
  }
  return connectionPools.get(connectionString)!;
}

// ===== GET: Fetch memories (all or semantic search) =====
export async function GET(request: NextRequest) {
  let client: any = null;
  
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { 
        id: true, 
        northflankProjectId: true, 
        postgresSchemaInitialized: true 
      },
    });

    if (!user?.postgresSchemaInitialized || !user.northflankProjectId) {
      return NextResponse.json({ 
        error: 'Database not initialized' 
      }, { status: 400 });
    }

    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    if (!connectionString) {
      return NextResponse.json({ 
        error: 'Database connection failed' 
      }, { status: 500 });
    }

    const pool = getPool(connectionString);
    client = await pool.connect();

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    let memories;

    if (query) {
      // ✅ Semantic search
      console.log(`🔍 Semantic search for user ${user.id}: "${query}"`);
      
      const ollamaUrl = process.env.OLLAMA_EXTERNAL_URL;
      if (!ollamaUrl) {
        throw new Error('OLLAMA_EXTERNAL_URL not configured');
      }
      
      // Generate embedding
      const embeddingResponse = await fetch(`${ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nomic-embed-text',
          prompt: query,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!embeddingResponse.ok) {
        throw new Error(`Embedding generation failed: ${embeddingResponse.status}`);
      }

      const { embedding } = await embeddingResponse.json();
      const vectorString = `[${embedding.join(',')}]`;

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
        [vectorString, user.id, 20]
      );

      memories = result.rows.map((row: any) => ({
        ...row,
        score: parseFloat(row.score),
      }));
    } else {
      // ✅ Get all memories
      console.log(`📋 Fetching all memories for user ${user.id}`);
      
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
        [user.id]
      );

      memories = result.rows;
    }

    return NextResponse.json({
      success: true,
      memories: memories || [],
      count: memories?.length || 0,
    });

  } catch (error) {
    console.error('❌ GET error:', error);
    
    // Better error messages
    if (error instanceof Error) {
      if (error.message.includes('timeout') || error.message.includes('57014')) {
        return NextResponse.json(
          { error: 'Database query timeout - please try again' },
          { status: 504 }
        );
      }
      if (error.message.includes('Connection terminated')) {
        return NextResponse.json(
          { error: 'Database connection lost - please refresh' },
          { status: 503 }
        );
      }
    }
    
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  } finally {
    if (client) {
      try {
        client.release();
      } catch (err) {
        console.error('Error releasing client:', err);
      }
    }
  }
}

// ===== POST: Add memory with Gating =====
export async function POST(request: NextRequest) {
  let client: any = null;
  
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content, metadata } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ 
        error: 'Content is required' 
      }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { 
        id: true, 
        northflankProjectId: true, 
        postgresSchemaInitialized: true 
      },
    });

    if (!user?.postgresSchemaInitialized || !user.northflankProjectId) {
      return NextResponse.json({ 
        error: 'Database not initialized' 
      }, { status: 400 });
    }

    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    if (!connectionString) {
      return NextResponse.json({ 
        error: 'Database connection failed' 
      }, { status: 500 });
    }

    // ✅ STEP 1: Call Gating Service
    console.log(`🛡️  Routing through Gating Service for user ${user.id}...`);
    
    let gatingData;
    try {
      const gatingResponse = await fetch(`${GATING_SERVICE_URL}/gating/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          text: content.trim(),
          database_url: connectionString,
          metadata: metadata || {},
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!gatingResponse.ok) {
        const errorText = await gatingResponse.text();
        console.error('❌ Gating failed:', {
          status: gatingResponse.status,
          statusText: gatingResponse.statusText,
          body: errorText,
        });
        throw new Error(`Gating service error: ${gatingResponse.status}`);
      }

      gatingData = await gatingResponse.json();
      
      console.log('✅ Gating result:', {
        routing: gatingData.routing,
        valence: gatingData.valence,
        alignment: gatingData.scores?.alignment,
      });

    } catch (gatingError) {
      console.error('❌ Gating service unreachable:', gatingError);
      
      // Fallback: treat as neutral/review
      gatingData = {
        routing: 'review',
        valence: 'neutral',
        scores: { alignment: 0.5 },
        status: 'fallback',
      };
    }

    // ✅ STEP 2: Add to memory_embeddings
    const ollamaUrl = process.env.OLLAMA_EXTERNAL_URL;
    
    if (!ollamaUrl) {
      throw new Error('OLLAMA_EXTERNAL_URL not configured');
    }
    
    try {
      const pool = getPool(connectionString);
      client = await pool.connect();
      
      console.log(`📝 Adding to memory_embeddings for user: ${user.id}`);
      
      // Generate embedding
      const embeddingResponse = await fetch(`${ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nomic-embed-text',
          prompt: content.trim(),
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!embeddingResponse.ok) {
        throw new Error(`Embedding generation failed: ${embeddingResponse.status}`);
      }

      const { embedding } = await embeddingResponse.json();
      const vectorString = `[${embedding.join(',')}]`;

      await client.query(
        `INSERT INTO user_data_schema.memory_embeddings 
         (user_id, content, embedding, metadata) 
         VALUES ($1, $2, $3::vector, $4)`,
        [
          user.id,
          content.trim(),
          vectorString,
          JSON.stringify({
            ...metadata,
            gating_routing: gatingData.routing,
            gating_valence: gatingData.valence,
            gating_scores: gatingData.scores,
            gating_timestamp: new Date().toISOString(),
          })
        ]
      );
      
    } catch (embeddingError) {
      console.error('⚠️  Embedding failed (non-critical):', embeddingError);
    }
    
    // ✅ STEP 3: Update counts
    const countUpdates: any = {};
    
    if (gatingData.routing === 'good') {
      countUpdates.goodChannelCount = { increment: 1 };
    } else if (gatingData.routing === 'bad') {
      countUpdates.badChannelCount = { increment: 1 };
    }
    
    if (Object.keys(countUpdates).length > 0) {
      await db.user.update({
        where: { id: user.id },
        data: {
          ...countUpdates,
          updatedAt: new Date(),
        },
      });
    }

    console.log(`✅ Memory processed via ${gatingData.routing} channel`);

    return NextResponse.json({ 
      success: true,
      routing: gatingData.routing,
      valence: gatingData.valence,
      safe_counterfactual: gatingData.safe_counterfactual,
      scores: gatingData.scores,
      message: gatingData.routing === 'bad' 
        ? 'Content flagged and safe alternative provided'
        : 'Memory added successfully',
    });

  } catch (error) {
    console.error('❌ POST error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  } finally {
    if (client) {
      try {
        client.release();
      } catch (err) {
        console.error('Error releasing client:', err);
      }
    }
  }
}

// ===== DELETE: Remove memory =====
export async function DELETE(request: NextRequest) {
  let client: any = null;
  
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { 
        id: true, 
        northflankProjectId: true, 
        postgresSchemaInitialized: true 
      },
    });

    if (!user?.postgresSchemaInitialized || !user.northflankProjectId) {
      return NextResponse.json({ 
        error: 'Database not initialized' 
      }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const memoryId = searchParams.get('id');

    if (!memoryId) {
      return NextResponse.json({ 
        error: 'Memory ID required' 
      }, { status: 400 });
    }

    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    if (!connectionString) {
      return NextResponse.json({ 
        error: 'Database connection failed' 
      }, { status: 500 });
    }

    const pool = getPool(connectionString);
    client = await pool.connect();

    const result = await client.query(
      'DELETE FROM user_data_schema.memory_embeddings WHERE id = $1 AND user_id = $2 RETURNING id',
      [memoryId, user.id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ 
        error: 'Memory not found or access denied' 
      }, { status: 404 });
    }

    console.log(`✅ Memory ${memoryId} deleted for user ${user.id}`);

    return NextResponse.json({ 
      success: true,
      message: 'Memory deleted successfully',
    });

  } catch (error) {
    console.error('❌ DELETE error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  } finally {
    if (client) {
      try {
        client.release();
      } catch (err) {
        console.error('Error releasing client:', err);
      }
    }
  }
}

// ===== Helper: Get Postgres connection string =====
async function getPostgresConnectionString(projectId: string): Promise<string | null> {
  try {
    const addonsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/addons`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!addonsResponse.ok) {
      console.error('❌ Addons API failed:', addonsResponse.status);
      return null;
    }

    const addonsData = await addonsResponse.json();
    const addonsList = addonsData.data?.addons || addonsData.data || [];
    
    if (!Array.isArray(addonsList)) {
      console.error('❌ Addons is not array');
      return null;
    }
    
    const postgresAddon = addonsList.find((a: any) => a.spec?.type === 'postgresql');

    if (!postgresAddon) {
      console.error('❌ No PostgreSQL addon found');
      return null;
    }

    const credentialsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}/credentials`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!credentialsResponse.ok) {
      console.error('❌ Credentials API failed');
      return null;
    }

    const credentials = await credentialsResponse.json();
    const connectionString = credentials.data?.envs?.EXTERNAL_POSTGRES_URI || 
                            credentials.data?.envs?.POSTGRES_URI || 
                            null;
    
    return connectionString;
  } catch (error) {
    console.error('💥 Error getting connection:', error);
    return null;
  }
}