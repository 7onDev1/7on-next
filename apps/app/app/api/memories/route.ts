// apps/app/app/api/memories/route.ts - FIXED: Complete CRUD with Gating
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import { getVectorMemory } from '@/lib/vector-memory';
import { Client } from 'pg';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const GATING_SERVICE_URL = process.env.GATING_SERVICE_URL || 'http://gating-service.internal:8080';

// ===== GET: Fetch memories (all or semantic search) =====
export async function GET(request: NextRequest) {
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

    const ollamaUrl = process.env.OLLAMA_EXTERNAL_URL;
    const vectorMemory = await getVectorMemory(connectionString, ollamaUrl);

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    let memories;

    if (query) {
      // Semantic search
      console.log(`🔍 Semantic search for user ${user.id}: "${query}"`);
      memories = await vectorMemory.searchMemories(user.id, query, 20);
    } else {
      // Get all memories
      console.log(`📋 Fetching all memories for user ${user.id}`);
      memories = await vectorMemory.getAllMemories(user.id);
    }

    return NextResponse.json({
      success: true,
      memories: memories || [],
      count: memories?.length || 0,
    });

  } catch (error) {
    console.error('❌ GET error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== POST: Add memory with Gating =====
export async function POST(request: NextRequest) {
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

    // ✅ STEP 1: Call Gating Service WITH database_url
    console.log(`🛡️  Routing through Gating Service for user ${user.id}...`);
    
    let gatingData;
    try {
      const gatingResponse = await fetch(`${GATING_SERVICE_URL}/gating/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          text: content.trim(),
          database_url: connectionString, // ← CRITICAL
          metadata: metadata || {},
        }),
        signal: AbortSignal.timeout(10000), // 10s timeout
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

    // ✅ STEP 2: Data already stored in appropriate channel by gating service
    // Good channel → stm_good
    // Bad channel → stm_bad (with counterfactual)
    // Review → stm_review

    // ✅ STEP 3: Also add to memory_embeddings for semantic search
    const ollamaUrl = process.env.OLLAMA_EXTERNAL_URL;
    
    try {
      const vectorMemory = await getVectorMemory(connectionString, ollamaUrl);
      
      console.log(`📝 Adding to memory_embeddings for user: ${user.id}`);
      await vectorMemory.addMemory(user.id, content.trim(), {
        ...metadata,
        gating_routing: gatingData.routing,
        gating_valence: gatingData.valence,
        gating_scores: gatingData.scores,
        gating_timestamp: new Date().toISOString(),
      });
    } catch (embeddingError) {
      console.error('⚠️  Embedding failed (non-critical):', embeddingError);
      // Continue even if embedding fails
    }
    
    // ✅ STEP 4: Update counts based on routing
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
  }
}

// ===== DELETE: Remove memory =====
export async function DELETE(request: NextRequest) {
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

    const ollamaUrl = process.env.OLLAMA_EXTERNAL_URL;
    const vectorMemory = await getVectorMemory(connectionString, ollamaUrl);

    // Delete with user_id verification for security
    await vectorMemory.deleteMemory(memoryId, user.id);

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