// apps/app/app/api/lora/train/route.ts - ETHICAL GROWTH VERSION
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import { Client } from 'pg';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const NORTHFLANK_JOB_ID = 'user-lora-training';

// ===== POST: Start Training =====
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
        loraTrainingStatus: true,
        postgresSchemaInitialized: true,
      },
    });

    if (!user?.northflankProjectId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 400 });
    }

    if (!user.postgresSchemaInitialized) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 400 });
    }

    if (user.loraTrainingStatus === 'training') {
      return NextResponse.json({
        error: 'Training already in progress',
        status: 'training',
      }, { status: 409 });
    }

    // ✅ Get Postgres connection
    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    
    if (!connectionString) {
      throw new Error('Cannot get database connection');
    }

    // ✅ Count from interaction_memories (NEW)
    const stats = await getTrainingStats(connectionString, user.id);
    
    console.log('📊 Training stats:', stats);

    // Validate minimum data (need at least 10 approved samples)
    if (stats.approved.total < 10) {
      return NextResponse.json({
        error: 'Not enough approved training data (need at least 10 samples)',
        current: stats.approved.total,
        stats: stats,
      }, { status: 400 });
    }

    // Auto-approve if needed
    if (stats.pending.total > 0) {
      console.log('📝 Auto-approving pending data...');
      await autoApproveData(connectionString, user.id);
      
      // Re-count after approval
      const updatedStats = await getTrainingStats(connectionString, user.id);
      if (updatedStats.approved.total < 10) {
        return NextResponse.json({
          error: 'Still not enough data after auto-approval',
          stats: updatedStats,
        }, { status: 400 });
      }
    }

    // Generate version
    const adapterVersion = `v${Date.now()}`;
    const trainingId = `train-${user.id.slice(0, 8)}-${adapterVersion}`;

    console.log(`🚀 Starting training: ${trainingId}`);

    // Update status to training
    await db.user.update({
      where: { id: user.id },
      data: {
        loraTrainingStatus: 'training',
        loraAdapterVersion: adapterVersion,
        loraTrainingError: null,
        updatedAt: new Date(),
      },
    });

    // Log to database
    await logTrainingJob(connectionString, {
      userId: user.id,
      jobId: trainingId,
      jobName: NORTHFLANK_JOB_ID,
      adapterVersion,
      datasetComposition: stats.approved,
      totalSamples: stats.approved.total,
      ethicalProfile: stats.profile,
    });

    // ✅ Trigger Northflank Job
    const jobResponse = await fetch(
      `https://api.northflank.com/v1/projects/${user.northflankProjectId}/jobs/${NORTHFLANK_JOB_ID}/runs`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          runtimeEnvironment: {
            POSTGRES_URI: connectionString,
            USER_ID: user.id,
            MODEL_NAME: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
            ADAPTER_VERSION: adapterVersion,
            OUTPUT_PATH: '/workspace/adapters',
            TRAINING_MODE: 'ethical_growth', // NEW: indicate new training mode
          },
        }),
      }
    );

    if (!jobResponse.ok) {
      const errorData = await jobResponse.json();
      console.error('❌ Northflank API error:', errorData);
      
      await db.user.update({
        where: { id: user.id },
        data: {
          loraTrainingStatus: 'failed',
          loraTrainingError: `Failed to start training: ${errorData.message || 'Unknown error'}`,
          updatedAt: new Date(),
        },
      });

      throw new Error(`Northflank API error: ${errorData.message || jobResponse.statusText}`);
    }

    const jobData = await jobResponse.json();
    const runId = jobData.data?.id;

    console.log('✅ Job triggered:', runId);

    // Start background monitoring
    startBackgroundMonitoring(
      user.id,
      trainingId,
      adapterVersion,
      connectionString,
      user.northflankProjectId,
      runId
    );

    return NextResponse.json({
      success: true,
      status: 'training',
      trainingId,
      adapterVersion,
      runId,
      message: 'Ethical growth training started successfully',
      estimatedTime: '10-30 minutes',
      stats: stats.approved,
      profile: stats.profile,
    });

  } catch (error) {
    console.error('❌ Training API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== GET: Status =====
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
        loraTrainingStatus: true,
        loraAdapterVersion: true,
        loraLastTrainedAt: true,
        loraTrainingError: true,
        postgresSchemaInitialized: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get stats from new system
    let stats: any = null;
    let profile: any = null;
    
    if (user.northflankProjectId && user.postgresSchemaInitialized) {
      const connectionString = await getPostgresConnectionString(user.northflankProjectId);
      if (connectionString) {
        const trainingStats = await getTrainingStats(connectionString, user.id);
        stats = trainingStats.approved;
        profile = trainingStats.profile;
      }
    }

    return NextResponse.json({
      status: user.loraTrainingStatus || 'idle',
      currentVersion: user.loraAdapterVersion,
      lastTrainedAt: user.loraLastTrainedAt,
      error: user.loraTrainingError,
      stats: stats || {
        growth_memory: 0,
        challenge_memory: 0,
        wisdom_moment: 0,
        needs_support: 0,
        total: 0,
      },
      profile: profile || null,
    });

  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== DELETE: Cancel =====
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
        loraTrainingStatus: true,
      },
    });

    if (!user || user.loraTrainingStatus !== 'training') {
      return NextResponse.json({ 
        error: 'No training in progress',
      }, { status: 400 });
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        loraTrainingStatus: 'cancelled',
        loraTrainingError: 'Cancelled by user',
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Training cancelled',
    });

  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== Helper Functions =====

/**
 * Get training statistics from interaction_memories
 */
async function getTrainingStats(connectionString: string, userId: string) {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Count approved samples by classification
    const approvedResult = await client.query(`
      SELECT 
        classification,
        COUNT(*) as count
      FROM user_data_schema.interaction_memories
      WHERE user_id = $1 AND approved_for_training = TRUE
      GROUP BY classification
    `, [userId]);
    
    // Count pending samples
    const pendingResult = await client.query(`
      SELECT 
        classification,
        COUNT(*) as count
      FROM user_data_schema.interaction_memories
      WHERE user_id = $1 AND approved_for_training = FALSE
      GROUP BY classification
    `, [userId]);
    
    // Get ethical profile
    const profileResult = await client.query(`
      SELECT 
        growth_stage,
        self_awareness,
        emotional_regulation,
        compassion,
        integrity,
        growth_mindset,
        wisdom,
        transcendence,
        total_interactions,
        breakthrough_moments
      FROM user_data_schema.ethical_profiles
      WHERE user_id = $1
    `, [userId]);
    
    const approved: any = {
      growth_memory: 0,
      challenge_memory: 0,
      wisdom_moment: 0,
      needs_support: 0,
      neutral_interaction: 0,
      total: 0,
    };
    
    approvedResult.rows.forEach(row => {
      approved[row.classification] = parseInt(row.count);
      approved.total += parseInt(row.count);
    });
    
    const pending: any = {
      growth_memory: 0,
      challenge_memory: 0,
      wisdom_moment: 0,
      needs_support: 0,
      neutral_interaction: 0,
      total: 0,
    };
    
    pendingResult.rows.forEach(row => {
      pending[row.classification] = parseInt(row.count);
      pending.total += parseInt(row.count);
    });
    
    const profile = profileResult.rows[0] || null;
    
    return { approved, pending, profile };
    
  } finally {
    await client.end();
  }
}

/**
 * Auto-approve data for training
 */
async function autoApproveData(connectionString: string, userId: string) {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Approve all non-support interactions
    await client.query(`
      UPDATE user_data_schema.interaction_memories
      SET approved_for_training = TRUE
      WHERE user_id = $1 
        AND approved_for_training = FALSE
        AND classification != 'needs_support'
    `, [userId]);
    
    console.log('✅ Data auto-approved');
    
  } finally {
    await client.end();
  }
}

/**
 * Log training job
 */
async function logTrainingJob(connectionString: string, data: any) {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    await client.query(`
      INSERT INTO user_data_schema.training_jobs 
        (user_id, job_id, job_name, adapter_version, status, 
         dataset_composition, total_samples, metadata, started_at)
      VALUES ($1, $2, $3, $4, 'running', $5, $6, $7, NOW())
    `, [
      data.userId, 
      data.jobId, 
      data.jobName, 
      data.adapterVersion,
      JSON.stringify(data.datasetComposition), 
      data.totalSamples,
      JSON.stringify({
        ethical_profile: data.ethicalProfile,
        training_mode: 'ethical_growth',
      }),
    ]);
  } finally {
    await client.end();
  }
}

/**
 * Background monitoring (simplified for brevity)
 */
function startBackgroundMonitoring(
  userId: string,
  trainingId: string,
  adapterVersion: string,
  connectionString: string,
  projectId: string,
  runId: string
) {
  // Same as before, but update to use new schema
  console.log(`🔍 Starting monitoring for ${runId}`);
  // Implementation same as original but adapted for new tables
}

/**
 * Get Postgres connection string
 */
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