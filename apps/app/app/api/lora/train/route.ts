// apps/app/app/api/lora/train/route.ts
// ✅ FIXED: ส่ง ENV แบบ dynamic ผ่าน API

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const NORTHFLANK_JOB_ID = 'user-lora-training'; // ✅ Confirmed from Northflank UI

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
        goodChannelCount: true,
        badChannelCount: true,
        mclChainCount: true,
        postgresSchemaInitialized: true,
      },
    });

    if (!user?.northflankProjectId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 400 });
    }

    if (!user.postgresSchemaInitialized) {
      return NextResponse.json({ error: 'Database not initialized' }, { status: 400 });
    }

    // Check if already training
    if (user.loraTrainingStatus === 'training') {
      return NextResponse.json({
        error: 'Training already in progress',
        status: 'training',
      }, { status: 409 });
    }

    // Validate minimum data
    const totalData = user.goodChannelCount + user.badChannelCount + user.mclChainCount;
    
    if (totalData < 10) {
      return NextResponse.json({
        error: 'Not enough training data (need at least 10 samples)',
        current: totalData,
      }, { status: 400 });
    }

    if (user.goodChannelCount < 5) {
      return NextResponse.json({
        error: 'Not enough good channel data (need at least 5 samples for quality training)',
        current: user.goodChannelCount,
      }, { status: 400 });
    }

    // ✅ Get REAL Postgres connection string
    console.log('📝 Getting Postgres connection...');
    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    
    if (!connectionString) {
      throw new Error('Cannot get database connection');
    }

    // Validate connection string format
    if (connectionString.includes('${refs.') || connectionString.includes('{{')) {
      throw new Error('Invalid connection string - still contains template variables');
    }

    console.log('✅ Got valid connection string');

    // Auto-approve data
    console.log('📝 Auto-approving data...');
    await autoApproveData(connectionString, user.id);

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
      datasetComposition: {
        good: user.goodChannelCount,
        bad: user.badChannelCount,
        mcl: user.mclChainCount,
      },
      totalSamples: totalData,
    });

    // ✅ Get Job details first to verify it exists
    console.log(`🔍 Checking job: ${NORTHFLANK_JOB_ID}`);
    
    const jobCheckResponse = await fetch(
      `https://api.northflank.com/v1/projects/${user.northflankProjectId}/jobs/${NORTHFLANK_JOB_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!jobCheckResponse.ok) {
      const errorData = await jobCheckResponse.json();
      console.error('❌ Job not found:', errorData);
      throw new Error(`Job '${NORTHFLANK_JOB_ID}' not found in project. Check job name.`);
    }

    console.log('✅ Job exists');

    // ✅ Trigger Northflank Job with DYNAMIC ENV
    console.log('🚀 Triggering Northflank job with dynamic ENV...');
    
    const jobResponse = await fetch(
      `https://api.northflank.com/v1/projects/${user.northflankProjectId}/jobs/${NORTHFLANK_JOB_ID}/runs`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // ✅ ส่ง ENV ตอน runtime (ต้องใช้ runtimeEnvironment ไม่ใช่ environmentVariables)
          runtimeEnvironment: {
            POSTGRES_URI: connectionString,  // ✅ Real connection string
            USER_ID: user.id,                // ✅ Dynamic user ID
            MODEL_NAME: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
            ADAPTER_VERSION: adapterVersion, // ✅ Dynamic version
            OUTPUT_PATH: '/workspace/adapters',
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

      await updateTrainingJobStatus(connectionString, trainingId, {
        status: 'failed',
        errorMessage: errorData.message || 'Failed to trigger job',
        completedAt: new Date(),
      });

      throw new Error(`Northflank API error: ${errorData.message || jobResponse.statusText}`);
    }

    const jobData = await jobResponse.json();
    const runId = jobData.data?.id;

    if (!runId) {
      throw new Error('No run ID returned from Northflank');
    }

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
      message: 'Training started successfully',
      estimatedTime: '10-30 minutes',
      stats: {
        good: user.goodChannelCount,
        bad: user.badChannelCount,
        mcl: user.mclChainCount,
        total: totalData,
      },
    });

  } catch (error) {
    console.error('❌ Training API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== Background Monitoring =====
function startBackgroundMonitoring(
  userId: string,
  trainingId: string,
  adapterVersion: string,
  connectionString: string,
  projectId: string,
  runId: string
) {
  console.log(`🔍 Starting background monitoring for run: ${runId}`);
  
  (async () => {
    const maxAttempts = 60; // 30 minutes (30s interval)
    let attempts = 0;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;
    
    while (attempts < maxAttempts) {
      try {
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30s
        attempts++;
        
        console.log(`🔍 [${runId}] Check ${attempts}/${maxAttempts}`);
        
        // Get job run status
        const statusResponse = await fetch(
          `https://api.northflank.com/v1/projects/${projectId}/jobs/${NORTHFLANK_JOB_ID}/runs/${runId}`,
          {
            headers: {
              'Authorization': `Bearer ${NORTHFLANK_API_TOKEN}`,
            },
          }
        );

        if (!statusResponse.ok) {
          throw new Error(`Status check failed: ${statusResponse.statusText}`);
        }

        const statusData = await statusResponse.json();
        const status = statusData.data?.status;
        
        consecutiveErrors = 0; // Reset on success
        
        console.log(`📊 [${runId}] Status: ${status}`);
        
        if (status === 'COMPLETED') {
          console.log(`✅ [${runId}] Training completed!`);
          
          // Get logs to extract metadata
          const logsResponse = await fetch(
            `https://api.northflank.com/v1/projects/${projectId}/jobs/${NORTHFLANK_JOB_ID}/runs/${runId}/logs?tail=5000`,
            {
              headers: {
                'Authorization': `Bearer ${NORTHFLANK_API_TOKEN}`,
              },
            }
          );

          let metadata = {};
          if (logsResponse.ok) {
            const logsData = await logsResponse.json();
            metadata = extractMetadataFromLogs(logsData.data?.logs || []);
          }
          
          // Update database
          await db.user.update({
            where: { id: userId },
            data: {
              loraTrainingStatus: 'completed',
              loraLastTrainedAt: new Date(),
              loraTrainingError: null,
              updatedAt: new Date(),
            },
          });
          
          await updateTrainingJobStatus(connectionString, trainingId, {
            status: 'completed',
            completedAt: new Date(),
            metadata: metadata || {},
          });
          
          break;
        }
        
        if (status === 'FAILED') {
          console.error(`❌ [${runId}] Training failed`);
          
          const errorMessage = statusData.data?.error || 'Training failed - check logs';
          
          await db.user.update({
            where: { id: userId },
            data: {
              loraTrainingStatus: 'failed',
              loraTrainingError: errorMessage,
              updatedAt: new Date(),
            },
          });
          
          await updateTrainingJobStatus(connectionString, trainingId, {
            status: 'failed',
            errorMessage: errorMessage,
            completedAt: new Date(),
          });
          
          break;
        }
        
        if (status === 'CANCELLED') {
          console.log(`⚠️ [${runId}] Training cancelled`);
          
          await db.user.update({
            where: { id: userId },
            data: {
              loraTrainingStatus: 'cancelled',
              loraTrainingError: 'Cancelled by user',
              updatedAt: new Date(),
            },
          });
          
          await updateTrainingJobStatus(connectionString, trainingId, {
            status: 'cancelled',
            completedAt: new Date(),
          });
          
          break;
        }
        
      } catch (error) {
        consecutiveErrors++;
        console.error(`❌ [${runId}] Monitoring error (${consecutiveErrors}/${maxConsecutiveErrors}):`, error);
        
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(`❌ [${runId}] Too many errors, giving up`);
          
          await db.user.update({
            where: { id: userId },
            data: {
              loraTrainingStatus: 'failed',
              loraTrainingError: 'Monitoring failed: ' + (error as Error).message,
              updatedAt: new Date(),
            },
          });
          
          break;
        }
      }
    }
    
    if (attempts >= maxAttempts) {
      console.warn(`⏰ [${runId}] Monitoring timeout`);
      
      await db.user.update({
        where: { id: userId },
        data: {
          loraTrainingStatus: 'failed',
          loraTrainingError: 'Training timeout - may still be running',
          updatedAt: new Date(),
        },
      });
    }
    
    console.log(`🏁 [${runId}] Monitoring ended`);
  })().catch(err => {
    console.error(`💥 [${runId}] Background monitoring crashed:`, err);
  });
}

// ===== GET: Status =====
// ✅ เพิ่มใน GET function (ประมาณบรรทัดที่ 350-400)
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
        goodChannelCount: true,
        badChannelCount: true,
        mclChainCount: true,
        postgresSchemaInitialized: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // ✅ FIX: Get review count from database
    let reviewCount = 0;
    
    if (user.northflankProjectId && user.postgresSchemaInitialized) {
      try {
        const connectionString = await getPostgresConnectionString(user.northflankProjectId);
        
        if (connectionString) {
          const { Client } = require('pg');
          const client = new Client({ connectionString });
          await client.connect();
          
          try {
            const result = await client.query(`
              SELECT COUNT(*) as count 
              FROM user_data_schema.stm_review 
              WHERE user_id = $1
            `, [user.id]);
            
            reviewCount = parseInt(result.rows[0]?.count || '0');
          } finally {
            await client.end();
          }
        }
      } catch (error) {
        console.error('Error getting review count:', error);
      }
    }

    return NextResponse.json({
      status: user.loraTrainingStatus || 'idle',
      currentVersion: user.loraAdapterVersion,
      lastTrainedAt: user.loraLastTrainedAt,
      error: user.loraTrainingError,
      stats: {
        goodChannel: user.goodChannelCount,
        badChannel: user.badChannelCount,
        mclChains: user.mclChainCount,
        reviewQueue: reviewCount, // ✅ เพิ่ม Review count
        total: user.goodChannelCount + user.badChannelCount + user.mclChainCount + reviewCount, // ✅ รวม Review
      },
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
        northflankProjectId: true,
        loraTrainingStatus: true,
      },
    });

    if (!user || user.loraTrainingStatus !== 'training') {
      return NextResponse.json({ 
        error: 'No training in progress',
      }, { status: 400 });
    }

    if (!user.northflankProjectId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 400 });
    }

    // Update status (actual cancellation would require tracking runId)
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

async function autoApproveData(connectionString: string, userId: string) {
  const { Client } = require('pg');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    await client.query(`
      UPDATE user_data_schema.stm_good 
      SET approved_for_consolidation = TRUE 
      WHERE user_id = $1 AND approved_for_consolidation = FALSE
    `, [userId]);
    
    await client.query(`
      UPDATE user_data_schema.stm_bad 
      SET approved_for_shadow_learning = TRUE 
      WHERE user_id = $1 AND approved_for_shadow_learning = FALSE
    `, [userId]);
    
    await client.query(`
      UPDATE user_data_schema.mcl_chains 
      SET approved_for_training = TRUE 
      WHERE user_id = $1 AND approved_for_training = FALSE
    `, [userId]);
    
    console.log('✅ Data auto-approved');
    
  } finally {
    await client.end();
  }
}

async function logTrainingJob(connectionString: string, data: any) {
  const { Client } = require('pg');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    await client.query(`
      INSERT INTO user_data_schema.training_jobs 
        (user_id, job_id, job_name, adapter_version, status, dataset_composition, total_samples, started_at)
      VALUES ($1, $2, $3, $4, 'running', $5, $6, NOW())
    `, [
      data.userId, data.jobId, data.jobName, data.adapterVersion,
      JSON.stringify(data.datasetComposition), data.totalSamples,
    ]);
  } finally {
    await client.end();
  }
}

async function updateTrainingJobStatus(connectionString: string, jobId: string, update: any) {
  const { Client } = require('pg');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    const setClauses: string[] = [];
    const values: any[] = [];
    let i = 1;
    
    if (update.status) {
      setClauses.push(`status = $${i++}`);
      values.push(update.status);
    }
    if (update.completedAt) {
      setClauses.push(`completed_at = $${i++}`);
      values.push(update.completedAt);
    }
    if (update.errorMessage) {
      setClauses.push(`error_message = $${i++}`);
      values.push(update.errorMessage);
    }
    if (update.metadata) {
      setClauses.push(`metadata = $${i++}`);
      values.push(JSON.stringify(update.metadata));
    }
    
    values.push(jobId);
    
    await client.query(`
      UPDATE user_data_schema.training_jobs 
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE job_id = $${i}
    `, values);
  } finally {
    await client.end();
  }
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

    if (!addonsResponse.ok) {
      console.error('Failed to get addons:', addonsResponse.statusText);
      return null;
    }

    const addonsData = await addonsResponse.json();
    const postgresAddon = addonsData.data?.addons?.find(
      (a: any) => a.spec?.type === 'postgresql'
    );

    if (!postgresAddon) {
      console.error('No PostgreSQL addon found');
      return null;
    }

    const credentialsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}/credentials`,
      { 
        headers: { 
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        } 
      }
    );

    if (!credentialsResponse.ok) {
      console.error('Failed to get credentials:', credentialsResponse.statusText);
      return null;
    }

    const credentials = await credentialsResponse.json();
    const uri = credentials.data?.envs?.EXTERNAL_POSTGRES_URI || 
                credentials.data?.envs?.POSTGRES_URI;

    if (!uri) {
      console.error('No POSTGRES_URI found in credentials');
      return null;
    }

    return uri;
    
  } catch (error) {
    console.error('Error getting connection string:', error);
    return null;
  }
}

function extractMetadataFromLogs(logs: any[]): any {
  try {
    const logText = logs.map(l => l.message || '').join('\n');
    
    const metadataMatch = logText.match(/===METADATA_START===([\s\S]*?)===METADATA_END===/);
    
    if (metadataMatch) {
      return JSON.parse(metadataMatch[1]);
    }
    
    return {};
  } catch (error) {
    console.error('Failed to extract metadata:', error);
    return {};
  }
}