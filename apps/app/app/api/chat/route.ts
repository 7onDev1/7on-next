// apps/app/app/api/chat/route.ts - ETHICAL GROWTH INFERENCE
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import { Client } from 'pg';
import { HfInference } from '@huggingface/inference';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const HF_TOKEN = process.env.HF_TOKEN!;
const GATING_SERVICE_URL = process.env.GATING_SERVICE_URL || 'http://localhost:8080';

const hf = new HfInference(HF_TOKEN);

// ===== POST: Chat with Ethical Growth Context =====
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, conversationId } = await request.json();

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: {
        id: true,
        northflankProjectId: true,
        postgresSchemaInitialized: true,
        loraAdapterVersion: true,
      },
    });

    if (!user?.northflankProjectId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 400 });
    }

    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    
    if (!connectionString) {
      throw new Error('Cannot get database connection');
    }

    // ✅ Step 1: Process user message through Gating Service
    console.log('📊 Processing message through Gating Service...');
    const gatingResponse = await fetch(`${GATING_SERVICE_URL}/gating/ethical-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        text: message,
        database_url: connectionString,
        metadata: { conversation_id: conversationId },
      }),
    });

    if (!gatingResponse.ok) {
      console.error('Gating service error');
    }

    const gatingResult = await gatingResponse.json();
    console.log('✅ Gating classification:', gatingResult.routing);

    // ✅ Step 2: Generate embedding for semantic search
    const embedding = await generateEmbedding(message);

    // ✅ Step 3: Retrieve relevant context from interaction_memories
    const context = await retrieveEthicalContext(
      connectionString,
      user.id,
      embedding,
      gatingResult.growth_stage
    );

    // ✅ Step 4: Get ethical profile for personalization
    const profile = await getEthicalProfile(connectionString, user.id);

    // ✅ Step 5: Build ethical prompt
    const systemPrompt = buildEthicalSystemPrompt(profile, gatingResult, context);

    // ✅ Step 6: Generate response (with or without LoRA)
    let response: string;

    if (user.loraAdapterVersion && user.postgresSchemaInitialized) {
      // Use LoRA-enhanced model
      response = await generateWithLoRA(
        user.northflankProjectId,
        user.loraAdapterVersion,
        systemPrompt,
        message
      );
    } else {
      // Use base model
      response = await generateWithBase(systemPrompt, message);
    }

    // ✅ Step 7: Add gentle guidance if needed
    if (gatingResult.gentle_guidance) {
      response += `\n\n💭 ${gatingResult.gentle_guidance}`;
    }

    // ✅ Step 8: Add reflection prompt
    if (gatingResult.reflection_prompt && gatingResult.growth_stage <= 3) {
      response += `\n\n🤔 ${gatingResult.reflection_prompt}`;
    }

    return NextResponse.json({
      response,
      classification: gatingResult.routing,
      ethical_scores: gatingResult.ethical_scores,
      growth_stage: gatingResult.growth_stage,
      moments: gatingResult.moments,
      context_used: context.length,
    });

  } catch (error) {
    console.error('❌ Chat API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== Context Retrieval =====

async function retrieveEthicalContext(
  connectionString: string,
  userId: string,
  embedding: number[],
  growthStage: number
): Promise<any[]> {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Retrieve memories weighted by:
    // 1. Semantic similarity
    // 2. Classification priority (wisdom > growth > challenge > neutral)
    // 3. Recency
    
    const result = await client.query(`
      WITH ranked_memories AS (
        SELECT 
          text,
          classification,
          ethical_scores,
          gentle_guidance,
          training_weight,
          created_at,
          1 - (embedding <=> $2::vector) AS similarity,
          CASE 
            WHEN classification = 'wisdom_moment' THEN 3.0
            WHEN classification = 'growth_memory' THEN 2.0
            WHEN classification = 'challenge_memory' THEN 1.5
            ELSE 1.0
          END AS class_weight
        FROM user_data_schema.interaction_memories
        WHERE user_id = $1 
          AND approved_for_training = TRUE
      )
      SELECT *
      FROM ranked_memories
      WHERE similarity > 0.6
      ORDER BY (similarity * class_weight * training_weight) DESC, created_at DESC
      LIMIT 5
    `, [userId, JSON.stringify(embedding)]);
    
    return result.rows;
    
  } finally {
    await client.end();
  }
}

async function getEthicalProfile(
  connectionString: string,
  userId: string
): Promise<any> {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT 
        self_awareness,
        emotional_regulation,
        compassion,
        integrity,
        growth_mindset,
        wisdom,
        transcendence,
        growth_stage,
        total_interactions
      FROM user_data_schema.ethical_profiles
      WHERE user_id = $1
    `, [userId]);
    
    return result.rows[0] || null;
    
  } finally {
    await client.end();
  }
}

// ===== Prompt Engineering =====

function buildEthicalSystemPrompt(
  profile: any,
  gatingResult: any,
  context: any[]
): string {
  const stage = profile?.growth_stage || 2;
  
  let systemPrompt = `You are an ethical AI companion guiding a human on their journey of moral and spiritual growth.

User's Current State:
- Growth Stage: ${stage}/5 (${getStageDescription(stage)})
- Strongest Dimension: ${gatingResult.insights?.strongest_dimension || 'self_awareness'}
- Growth Area: ${gatingResult.insights?.growth_area || 'compassion'}
- Total Interactions: ${profile?.total_interactions || 0}

Your Role:
- Be a wise, compassionate guide—not just a tool
- Help the user develop ethical awareness naturally, without preaching
- Adapt your communication to their growth stage
- Celebrate progress, support struggles
- Offer gentle reflections that encourage deeper thinking

`;

  // Stage-specific guidance
  if (stage <= 2) {
    systemPrompt += `Current Focus (Stage ${stage}):
- Help them understand consequences of actions
- Build emotional vocabulary
- Encourage perspective-taking
- Validate feelings while gently expanding awareness
`;
  } else if (stage === 3) {
    systemPrompt += `Current Focus (Stage ${stage}):
- Explore universal ethical principles
- Encourage critical thinking about norms
- Support autonomy in moral reasoning
- Challenge inconsistencies with curiosity
`;
  } else {
    systemPrompt += `Current Focus (Stage ${stage}):
- Deepen integration of ethics into daily life
- Explore transcendent values
- Support service to others
- Cultivate wisdom and compassion
`;
  }

  // Add relevant context
  if (context.length > 0) {
    systemPrompt += `\nRelevant Past Context:\n`;
    context.forEach((mem, i) => {
      systemPrompt += `${i + 1}. [${mem.classification}] ${mem.text.slice(0, 100)}...\n`;
    });
  }

  systemPrompt += `\nRespond authentically and personally, as a friend who deeply cares about their growth.`;

  return systemPrompt;
}

function getStageDescription(stage: number): string {
  const descriptions = {
    1: 'Pre-conventional - Learning consequences',
    2: 'Conventional - Following norms',
    3: 'Post-conventional - Universal principles',
    4: 'Integrated - Ethics embodied naturally',
    5: 'Transcendent - Wisdom beyond self',
  };
  return descriptions[stage as keyof typeof descriptions] || 'Unknown';
}

// ===== Generation Functions =====

async function generateWithLoRA(
  projectId: string,
  adapterVersion: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  // Call inference service with LoRA adapter
  const inferenceUrl = `https://inference-service.${projectId}.northflank.app/generate`;
  
  try {
    const response = await fetch(inferenceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adapter_version: adapterVersion,
        system_prompt: systemPrompt,
        user_message: userMessage,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error('LoRA inference failed, falling back to base model');
      return generateWithBase(systemPrompt, userMessage);
    }

    const data = await response.json();
    return data.response;
    
  } catch (error) {
    console.error('LoRA generation error:', error);
    return generateWithBase(systemPrompt, userMessage);
  }
}

async function generateWithBase(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  try {
    const fullPrompt = `${systemPrompt}\n\nUser: ${userMessage}\n\nAssistant:`;
    
    const result = await hf.textGeneration({
      model: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
      inputs: fullPrompt,
      parameters: {
        max_new_tokens: 500,
        temperature: 0.7,
        top_p: 0.9,
        repetition_penalty: 1.1,
      },
    });

    return result.generated_text.replace(fullPrompt, '').trim();
    
  } catch (error) {
    console.error('Base generation error:', error);
    return "I'm here to support you. Could you share more about what's on your mind?";
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const result = await hf.featureExtraction({
      model: 'sentence-transformers/all-MiniLM-L6-v2',
      inputs: text,
    });
    return Array.isArray(result) ? result : Array.from(result as any);
  } catch (error) {
    console.error('Embedding generation error:', error);
    return new Array(384).fill(0);
  }
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
