// apps/app/app/api/ai/route.ts
/**
 * Complete AI API Routes
 * - Chat with gating
 * - Training triggers
 * - Approval endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import { generateResponse, approveForConsolidation } from '@/lib/complete-inference';

const GATING_SERVICE_URL = process.env.GATING_SERVICE_URL || 'https://sun--gating-service--lrnpwmyyyl8p.code.run:8080';
const OLLAMA_EXTERNAL_URL = process.env.OLLAMA_EXTERNAL_URL!;

// ===== POST /api/ai/chat - Main chat endpoint =====
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { message, conversationHistory, sessionId } = body;

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { id: true, northflankProjectId: true },
    });

    if (!user?.northflankProjectId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 400 });
    }

    // 1. Get Postgres connection FIRST (ย้ายมาก่อน)
    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    if (!connectionString) {
      throw new Error('Database connection failed');
    }

    // 2. Call Gating Service WITH database_url
    const gatingResponse = await fetch(`${GATING_SERVICE_URL}/gating/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        text: message,
        database_url: connectionString, // ← เพิ่มบรรทัดนี้สำคัญมาก!
        session_id: sessionId,
      }),
    });

    if (!gatingResponse.ok) {
      throw new Error('Gating service failed');
    }

    const gatingData = await gatingResponse.json();

    // 3. If routed to bad channel and has safe counterfactual, return it
    if (gatingData.routing === 'bad' && gatingData.safe_counterfactual) {
      return NextResponse.json({
        response: gatingData.safe_counterfactual,
        routing: 'bad',
        detected: gatingData.scores,
        usedSafeFallback: true,
      });
    }

    // 4. Generate response with inference engine
    const result = await generateResponse({
      userId: user.id,
      userMessage: message,
      connectionString,
      ollamaUrl: OLLAMA_EXTERNAL_URL,
      conversationHistory: conversationHistory || [],
    });

    return NextResponse.json({
      response: result.response,
      routing: gatingData.routing,
      detected: result.detected,
      usedSafeFallback: result.usedSafeFallback,
      mclContext: result.mclContext,
    });

  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== POST /api/ai/approve - Batch approve for consolidation =====
export async function PUT(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { channel, minScore } = body;

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { id: true, northflankProjectId: true },
    });

    if (!user?.northflankProjectId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 400 });
    }

    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    if (!connectionString) {
      throw new Error('Database connection failed');
    }

    const count = await approveForConsolidation(
      connectionString,
      user.id,
      channel,
      minScore
    );

    return NextResponse.json({
      success: true,
      approved: count,
      channel,
    });

  } catch (error) {
    console.error('Approval error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== Helper =====
async function getPostgresConnectionString(projectId: string): Promise<string | null> {
  const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
  
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
        },
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