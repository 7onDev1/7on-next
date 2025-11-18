// apps/app/app/api/memories/route.ts - COMPLETE FIX
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import { Client } from 'pg';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const GATING_SERVICE_URL = process.env.GATING_SERVICE_URL || 'http://localhost:8080';

// ===== POST: Add Memory - FIX: ส่ง database_url ไป Gating =====
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { text, metadata = {} } = await request.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: {
        id: true,
        northflankProjectId: true,
        postgresSchemaInitialized: true,
      },
    });

    if (!user?.northflankProjectId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 400 });
    }

    if (!user.postgresSchemaInitialized) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 400 });
    }

    // ✅ FIX 1: Get connection string BEFORE calling gating
    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    
    if (!connectionString) {
      throw new Error('Cannot get database connection');
    }

    console.log('📝 Sending to gating service WITH database_url...');

    // ✅ FIX 2: ส่ง database_url ไป Gating Service
    const gatingResponse = await fetch(`${GATING_SERVICE_URL}/gating/ethical-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        text: text,
        database_url: connectionString, // ← ✅ เพิ่มบรรทัดนี้!
        metadata: metadata,
      }),
    });

    if (!gatingResponse.ok) {
      const errorText = await gatingResponse.text();
      console.error('❌ Gating error:', errorText);
      throw new Error(`Gating service error: ${errorText}`);
    }

    const gatingResult = await gatingResponse.json();

    console.log('✅ Gating result:', {
      classification: gatingResult.routing,
      stage: gatingResult.growth_stage,
      language: gatingResult.detected_language,
      memory_id: gatingResult.memory_id, // ถ้า gating return กลับมา
    });

    return NextResponse.json({
      success: true,
      classification: gatingResult.routing,
      ethical_scores: gatingResult.ethical_scores,
      growth_stage: gatingResult.growth_stage,
      moments: gatingResult.moments,
      reflection_prompt: gatingResult.reflection_prompt,
      gentle_guidance: gatingResult.gentle_guidance,
      growth_opportunity: gatingResult.growth_opportunity,
      detected_language: gatingResult.detected_language,
      message: 'Memory processed and stored successfully',
    });

  } catch (error) {
    console.error('❌ Memory API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== GET: List Memories - FIX: ดึง classification อย่างถูกต้อง =====
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: {
        id: true,
        northflankProjectId: true,
        postgresSchemaInitialized: true,
      },
    });

    if (!user?.northflankProjectId || !user.postgresSchemaInitialized) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 400 });
    }

    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    
    if (!connectionString) {
      throw new Error('Cannot get database connection');
    }

    const client = new Client({ connectionString });
    
    try {
      await client.connect();
      
      let memories = [];

      if (query) {
        // ✅ SEMANTIC SEARCH with better JOIN
        console.log(`🔍 Semantic search: "${query}"`);
        
        const OLLAMA_URL = process.env.OLLAMA_EXTERNAL_URL!;
        const embeddingResponse = await fetch(`${OLLAMA_URL}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'nomic-embed-text',
            prompt: query,
          }),
        });

        if (!embeddingResponse.ok) {
          throw new Error('Embedding generation failed');
        }

        const embeddingData = await embeddingResponse.json();
        const queryEmbedding = embeddingData.embedding;
        const vectorString = `[${queryEmbedding.join(',')}]`;

        // ✅ FIX 3: Better query - ดึงจาก interaction_memories เป็นหลัก
        const result = await client.query(`
          SELECT 
            im.id::text as id,
            im.text,
            im.classification,
            im.ethical_scores,
            im.moments,
            im.reflection_prompt,
            im.gentle_guidance,
            im.metadata,
            im.created_at,
            me.embedding,
            1 - (me.embedding <=> $1::vector) as score
          FROM user_data_schema.interaction_memories im
          INNER JOIN user_data_schema.memory_embeddings me 
            ON me.id::text = (im.metadata->>'memory_embedding_id')
          WHERE im.user_id = $2
          ORDER BY me.embedding <=> $1::vector
          LIMIT $3 OFFSET $4
        `, [vectorString, user.id, limit, offset]);

        memories = result.rows;
      } else {
        // ✅ FIX 4: List all - ดึงจาก interaction_memories เป็นหลัก
        console.log('📋 Listing all memories from interaction_memories');
        
        const result = await client.query(`
          SELECT 
            im.id::text as id,
            im.text,
            im.classification,
            im.ethical_scores,
            im.moments,
            im.reflection_prompt,
            im.gentle_guidance,
            im.metadata,
            im.created_at
          FROM user_data_schema.interaction_memories im
          WHERE im.user_id = $1
          ORDER BY im.created_at DESC
          LIMIT $2 OFFSET $3
        `, [user.id, limit, offset]);

        memories = result.rows;
      }
      
      // Get total count from interaction_memories
      const countResult = await client.query(`
        SELECT COUNT(*) as total
        FROM user_data_schema.interaction_memories
        WHERE user_id = $1
      `, [user.id]);
      
      // Get ethical profile
      const profileResult = await client.query(`
        SELECT 
          self_awareness,
          emotional_regulation,
          compassion,
          integrity,
          growth_mindset,
          wisdom,
          transcendence,
          growth_stage,
          total_interactions,
          breakthrough_moments
        FROM user_data_schema.ethical_profiles
        WHERE user_id = $1
      `, [user.id]);
      
      console.log(`✅ Retrieved ${memories.length} memories with classifications`);
      
      // ✅ FIX 5: Ensure classification is never null
      const sanitizedMemories = memories.map(m => ({
        ...m,
        classification: m.classification || 'neutral_interaction',
        metadata: {
          ...m.metadata,
          classification: m.classification || 'neutral_interaction',
        }
      }));
      
      return NextResponse.json({
        memories: sanitizedMemories,
        total: parseInt(countResult.rows[0]?.total || '0'),
        limit,
        offset,
        ethical_profile: profileResult.rows[0] || null,
      });
      
    } finally {
      await client.end();
    }

  } catch (error) {
    console.error('❌ Get memories error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== DELETE: Remove Memory - Delete from interaction_memories first =====
export async function DELETE(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const memoryId = searchParams.get('id');

    if (!memoryId) {
      return NextResponse.json({ error: 'Memory ID required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: {
        id: true,
        northflankProjectId: true,
      },
    });

    if (!user?.northflankProjectId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 400 });
    }

    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    
    if (!connectionString) {
      throw new Error('Cannot get database connection');
    }

    const client = new Client({ connectionString });
    
    try {
      await client.connect();
      
      // ✅ FIX 6: Delete from interaction_memories by ID directly
      const deleteResult = await client.query(`
        DELETE FROM user_data_schema.interaction_memories
        WHERE id = $1 AND user_id = $2
        RETURNING metadata->>'memory_embedding_id' as embedding_id
      `, [memoryId, user.id]);
      
      if (deleteResult.rowCount === 0) {
        return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
      }
      
      // ✅ Also delete linked memory_embedding if exists
      const embeddingId = deleteResult.rows[0]?.embedding_id;
      if (embeddingId) {
        await client.query(`
          DELETE FROM user_data_schema.memory_embeddings
          WHERE id = $1
        `, [embeddingId]);
      }
      
      console.log(`✅ Deleted memory ${memoryId} and linked embedding`);
      
      return NextResponse.json({
        success: true,
        message: 'Memory deleted successfully',
      });
      
    } finally {
      await client.end();
    }

  } catch (error) {
    console.error('❌ Delete error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== Helper: Get Postgres Connection =====
async function getPostgresConnectionString(projectId: string): Promise<string | null> {
  try {
    const addonsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/addons`,
      { 
        headers: { 
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        } 
      }
    );

    if (!addonsResponse.ok) return null;

    const addonsData = await addonsResponse.json();
    const postgresAddon = addonsData.data?.addons?.find(
      (a: any) => a.spec?.type === 'postgresql'
    );

    if (!postgresAddon) return null;

    const credentialsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}/credentials`,
      { 
        headers: { 
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        } 
      }
    );

    if (!credentialsResponse.ok) return null;

    const credentials = await credentialsResponse.json();
    return credentials.data?.envs?.EXTERNAL_POSTGRES_URI || 
           credentials.data?.envs?.POSTGRES_URI || 
           null;

  } catch (error) {
    console.error('Error getting connection string:', error);
    return null;
  }
}