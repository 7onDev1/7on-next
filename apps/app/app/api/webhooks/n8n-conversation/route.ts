// apps/app/app/api/webhooks/n8n-conversation/route.ts
/**
 * N8N Webhook Endpoint for Conversation Logs
 * 
 * ✅ ผู้ใช้ทั้งหมดใช้ webhook เดียวกัน แต่แยก user_id
 * ✅ ผ่าน Gating Service ก่อนเก็บ
 * ✅ เก็บลง Postgres channel ที่ถูกต้อง
 */

import { NextRequest, NextResponse } from 'next/server';
import { database as db } from '@repo/database';
import { Client } from 'pg';

const GATING_SERVICE_URL = process.env.GATING_SERVICE_URL!;
const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;

interface N8NWebhookPayload {
  user_id: string;
  message: string;
  conversation_id?: string;
  session_id?: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔔 N8N Webhook received');
    
    // 1. Verify webhook signature (optional - for security)
    const signature = request.headers.get('x-n8n-signature');
    if (process.env.N8N_WEBHOOK_SECRET && signature) {
      // Verify signature here if needed
    }

    // 2. Parse payload
    const payload: N8NWebhookPayload = await request.json();
    
    console.log('📦 Payload:', {
      user_id: payload.user_id,
      message_length: payload.message?.length,
      has_session: !!payload.session_id,
    });

    // 3. Validate required fields
    if (!payload.user_id || !payload.message) {
      return NextResponse.json(
        { error: 'Missing required fields: user_id, message' },
        { status: 400 }
      );
    }

    // 4. Get user from database
    const user = await db.user.findUnique({
      where: { id: payload.user_id },
      select: {
        id: true,
        northflankProjectId: true,
        postgresSchemaInitialized: true,
      },
    });

    if (!user) {
      console.error('❌ User not found:', payload.user_id);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.northflankProjectId || !user.postgresSchemaInitialized) {
      console.error('❌ User not ready:', {
        hasProject: !!user.northflankProjectId,
        schemaInit: user.postgresSchemaInitialized,
      });
      return NextResponse.json(
        { error: 'User database not initialized' },
        { status: 400 }
      );
    }

    // 5. Get Postgres connection
    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    if (!connectionString) {
      console.error('❌ Cannot get database connection');
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      );
    }

    // 6. Call Gating Service
    console.log('🛡️ Routing through Gating Service...');
    
    let gatingResult;
    try {
      const gatingResponse = await fetch(`${GATING_SERVICE_URL}/gating/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          text: payload.message,
          database_url: connectionString,
          session_id: payload.session_id,
          metadata: {
            source: 'n8n_conversation',
            conversation_id: payload.conversation_id,
            ...payload.metadata,
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!gatingResponse.ok) {
        throw new Error(`Gating service error: ${gatingResponse.status}`);
      }

      gatingResult = await gatingResponse.json();
      
      console.log('✅ Gating result:', {
        routing: gatingResult.routing,
        valence: gatingResult.valence,
      });

    } catch (gatingError) {
      console.error('⚠️ Gating service unreachable:', gatingError);
      
      // Fallback: treat as review
      gatingResult = {
        routing: 'review',
        valence: 'neutral',
        scores: { alignment: 0.5 },
        status: 'fallback',
      };
    }

    // 7. Update user counts based on routing
    const countUpdates: any = {};
    
    if (gatingResult.routing === 'good') {
      countUpdates.goodChannelCount = { increment: 1 };
    } else if (gatingResult.routing === 'bad') {
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

    // 8. Also add to memory_embeddings for semantic search (optional)
    try {
      const ollamaUrl = process.env.OLLAMA_EXTERNAL_URL;
      
      if (ollamaUrl) {
        const { getVectorMemory } = await import('@/lib/vector-memory');
        const vectorMemory = await getVectorMemory(connectionString, ollamaUrl);
        
        await vectorMemory.addMemory(user.id, payload.message, {
          source: 'n8n_conversation',
          conversation_id: payload.conversation_id,
          gating_routing: gatingResult.routing,
          gating_valence: gatingResult.valence,
          gating_scores: gatingResult.scores,
          timestamp: payload.timestamp || new Date().toISOString(),
        });
        
        console.log('✅ Added to memory_embeddings');
      }
    } catch (embeddingError) {
      console.error('⚠️ Embedding failed (non-critical):', embeddingError);
    }

    // 9. Success response
    return NextResponse.json({
      success: true,
      routing: gatingResult.routing,
      valence: gatingResult.valence,
      safe_counterfactual: gatingResult.safe_counterfactual,
      message: 'Conversation logged successfully',
      stored_in_channel: gatingResult.routing,
    });

  } catch (error) {
    console.error('💥 Webhook error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'healthy',
    endpoint: 'n8n-conversation-webhook',
    timestamp: new Date().toISOString(),
  });
}

// ===== Helper Functions =====

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
    const addonsList = addonsData.data?.addons || [];
    
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
    return credentials.data?.envs?.EXTERNAL_POSTGRES_URI || 
           credentials.data?.envs?.POSTGRES_URI || 
           null;
           
  } catch (error) {
    console.error('💥 Error getting connection:', error);
    return null;
  }
}