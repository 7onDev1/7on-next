// apps/app/app/api/profile/ethical/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import { Client } from 'pg';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;

// ===== GET: Get Ethical Profile =====
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
      
      // Get ethical profile
      const profileResult = await client.query(`
        SELECT 
          user_id,
          self_awareness,
          emotional_regulation,
          compassion,
          integrity,
          growth_mindset,
          wisdom,
          transcendence,
          growth_stage,
          total_interactions,
          breakthrough_moments,
          crisis_interventions,
          created_at,
          updated_at
        FROM user_data_schema.ethical_profiles
        WHERE user_id = $1
      `, [user.id]);
      
      if (profileResult.rows.length === 0) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
      
      // Get memory statistics
      const statsResult = await client.query(`
        SELECT 
          classification,
          COUNT(*) as count,
          AVG(training_weight) as avg_weight,
          COUNT(CASE WHEN approved_for_training THEN 1 END) as approved_count
        FROM user_data_schema.interaction_memories
        WHERE user_id = $1
        GROUP BY classification
      `, [user.id]);
      
      // Get recent milestones
      const milestonesResult = await client.query(`
        SELECT 
          milestone_type,
          description,
          created_at
        FROM user_data_schema.growth_milestones
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [user.id]);
      
      const profile = profileResult.rows[0];
      
      // Calculate overall progress
      const avgScore = (
        profile.self_awareness +
        profile.emotional_regulation +
        profile.compassion +
        profile.integrity +
        profile.growth_mindset +
        profile.wisdom +
        profile.transcendence
      ) / 7;
      
      const stats: any = {};
      statsResult.rows.forEach((row: any) => {
        stats[row.classification] = {
          total: parseInt(row.count),
          approved: parseInt(row.approved_count),
          avg_weight: parseFloat(row.avg_weight),
        };
      });
      
      return NextResponse.json({
        profile: {
          ...profile,
          overall_score: avgScore,
        },
        statistics: stats,
        milestones: milestonesResult.rows,
        stage_description: getStageDescription(profile.growth_stage),
      });
      
    } finally {
      await client.end();
    }

  } catch (error) {
    console.error('❌ Profile API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== POST: Recalculate Profile =====
export async function POST(request: NextRequest) {
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
      
      // Recalculate profile from all memories
      const result = await client.query(`
        SELECT 
          AVG((ethical_scores->>'self_awareness')::float) as avg_self_awareness,
          AVG((ethical_scores->>'emotional_regulation')::float) as avg_emotional_regulation,
          AVG((ethical_scores->>'compassion')::float) as avg_compassion,
          AVG((ethical_scores->>'integrity')::float) as avg_integrity,
          AVG((ethical_scores->>'growth_mindset')::float) as avg_growth_mindset,
          AVG((ethical_scores->>'wisdom')::float) as avg_wisdom,
          AVG((ethical_scores->>'transcendence')::float) as avg_transcendence,
          COUNT(*) as total_interactions,
          COUNT(CASE WHEN classification = 'wisdom_moment' THEN 1 END) as breakthrough_count
        FROM user_data_schema.interaction_memories
        WHERE user_id = $1
      `, [user.id]);
      
      const stats = result.rows[0];
      
      if (stats && stats.total_interactions > 0) {
        const avgScore = (
          parseFloat(stats.avg_self_awareness || 0.3) +
          parseFloat(stats.avg_emotional_regulation || 0.4) +
          parseFloat(stats.avg_compassion || 0.4) +
          parseFloat(stats.avg_integrity || 0.5) +
          parseFloat(stats.avg_growth_mindset || 0.4) +
          parseFloat(stats.avg_wisdom || 0.3) +
          parseFloat(stats.avg_transcendence || 0.2)
        ) / 7;
        
        let growthStage = 2;
        if (avgScore < 0.3) growthStage = 1;
        else if (avgScore < 0.5) growthStage = 2;
        else if (avgScore < 0.7) growthStage = 3;
        else if (avgScore < 0.85) growthStage = 4;
        else growthStage = 5;
        
        await client.query(`
          UPDATE user_data_schema.ethical_profiles
          SET 
            self_awareness = $1,
            emotional_regulation = $2,
            compassion = $3,
            integrity = $4,
            growth_mindset = $5,
            wisdom = $6,
            transcendence = $7,
            growth_stage = $8,
            total_interactions = $9,
            breakthrough_moments = $10,
            updated_at = NOW(),
            last_calculated_at = NOW()
          WHERE user_id = $11
        `, [
          parseFloat(stats.avg_self_awareness || 0.3),
          parseFloat(stats.avg_emotional_regulation || 0.4),
          parseFloat(stats.avg_compassion || 0.4),
          parseFloat(stats.avg_integrity || 0.5),
          parseFloat(stats.avg_growth_mindset || 0.4),
          parseFloat(stats.avg_wisdom || 0.3),
          parseFloat(stats.avg_transcendence || 0.2),
          growthStage,
          parseInt(stats.total_interactions),
          parseInt(stats.breakthrough_count || 0),
          user.id
        ]);
        
        return NextResponse.json({
          success: true,
          message: 'Profile recalculated',
          updated_stage: growthStage,
        });
      }
      
      return NextResponse.json({
        success: false,
        message: 'No interactions found',
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

// ===== Helper Functions =====

function getStageDescription(stage: number): string {
  const descriptions = {
    1: 'Pre-conventional: Learning to understand consequences',
    2: 'Conventional: Following social norms and expectations',
    3: 'Post-conventional: Guided by universal principles',
    4: 'Integrated: Ethics naturally embodied in daily life',
    5: 'Transcendent: Wisdom and compassion beyond self',
  };
  return descriptions[stage as keyof typeof descriptions] || 'Unknown';
}

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