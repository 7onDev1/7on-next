// apps/app/app/api/memories/route.ts - ETHICAL GROWTH VERSION
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import { Client } from 'pg';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const GATING_SERVICE_URL = process.env.GATING_SERVICE_URL || 'http://localhost:8080';

// ===== POST: Add Memory (with Ethical Gating) =====
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

    // Get Postgres connection
    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    
    if (!connectionString) {
      throw new Error('Cannot get database connection');
    }

    // ✅ Call Ethical Gating Service
    const gatingResponse = await fetch(`${GATING_SERVICE_URL}/gating/ethical-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        text: text,
        database_url: connectionString,
        metadata: metadata,
      }),
    });

    if (!gatingResponse.ok) {
      throw new Error(`Gating service error: ${gatingResponse.statusText}`);
    }

    const gatingResult = await gatingResponse.json();

    console.log('📊 Gating result:', {
      classification: gatingResult.routing,
      stage: gatingResult.growth_stage,
      language: gatingResult.detected_language,
    });

    // Memory already saved by gating service
    // Return enriched response
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
      message: 'Memory processed successfully',
    });

  } catch (error) {
    console.error('❌ Memory API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== GET: List Memories =====
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const classification = searchParams.get('classification'); // growth_memory, challenge_memory, etc.
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
      
      // Get memories with optional classification filter
      const whereClause = classification 
        ? `AND classification = $2`
        : '';
      
      const params = classification
        ? [user.id, classification, limit, offset]
        : [user.id, limit, offset];
      
      const result = await client.query(`
        SELECT 
          id,
          text,
          classification,
          ethical_scores,
          moments,
          reflection_prompt,
          gentle_guidance,
          approved_for_training,
          training_weight,
          metadata,
          created_at
        FROM user_data_schema.interaction_memories
        WHERE user_id = $1 ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${classification ? 3 : 2} OFFSET $${classification ? 4 : 3}
      `, params);
      
      // Get total count
      const countResult = await client.query(`
        SELECT COUNT(*) as total
        FROM user_data_schema.interaction_memories
        WHERE user_id = $1 ${whereClause}
      `, classification ? [user.id, classification] : [user.id]);
      
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
      
      return NextResponse.json({
        memories: result.rows,
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

// ===== DELETE: Remove Memory =====
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
      
      await client.query(`
        DELETE FROM user_data_schema.interaction_memories
        WHERE id = $1 AND user_id = $2
      `, [memoryId, user.id]);
      
      return NextResponse.json({
        success: true,
        message: 'Memory deleted',
      });
      
    } finally {
      await client.end();
    }

  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== PATCH: Update Memory Approval Status =====
export async function PATCH(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { memoryId, approved } = await request.json();

    if (!memoryId || typeof approved !== 'boolean') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
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
      
      await client.query(`
        UPDATE user_data_schema.interaction_memories
        SET approved_for_training = $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3
      `, [approved, memoryId, user.id]);
      
      return NextResponse.json({
        success: true,
        message: `Memory ${approved ? 'approved' : 'unapproved'} for training`,
      });
      
    } finally {
      await client.end();
    }

  } catch (error) {
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