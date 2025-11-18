// app/api/provision-northflank/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { database as db } from '@repo/database';
import { auth } from '@clerk/nextjs/server';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://your-app.vercel.app/api/setup-webhook';
const WEBHOOK_AUTH_TOKEN = process.env.WEBHOOK_AUTH_TOKEN || 'webhook-secret-token-7on';

const runningMonitors = new Set<string>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userName, userEmail } = body;

    console.log('🚀 Provision Northflank called for user:', userId);

    if (!userId || !userEmail) {
      return NextResponse.json(
        { success: false, error: 'Missing userId or userEmail' },
        { status: 400 }
      );
    }

    let clerkUserId: string | null = null;
    
    const dbUser = await db.user.findUnique({
      where: { id: userId },
      select: { clerkId: true },
    });

    if (dbUser?.clerkId) {
      clerkUserId = dbUser.clerkId;
      console.log('✅ Clerk User ID from database:', clerkUserId);
    } else {
      const authResult = await auth();
      if (authResult?.userId) {
        clerkUserId = authResult.userId;
        console.log('✅ Clerk User ID from auth context:', clerkUserId);
      } else {
        console.error('❌ Could not retrieve Clerk User ID');
        return NextResponse.json(
          { success: false, error: 'Could not retrieve Clerk User ID' },
          { status: 400 }
        );
      }
    }

    if (runningMonitors.has(userId)) {
      console.log('⚠️ Monitoring already running for user:', userId);
      return NextResponse.json({
        success: true,
        message: 'Monitoring already in progress for this user',
        status: 'monitoring_active',
      });
    }

    const existingUser = await db.user.findUnique({
      where: { id: userId },
      select: {
        northflankProjectId: true,
        n8nUrl: true,
        n8nApiKey: true,
        n8nEncryptionKey: true,
        northflankProjectStatus: true,
      },
    });

    if (existingUser?.northflankProjectId) {
      console.log('User already has a project:', existingUser.northflankProjectId);

      const projectResponse = await fetch(
        `https://api.northflank.com/v1/projects/${existingUser.northflankProjectId}`,
        {
          headers: {
            Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (projectResponse.ok) {
        const project = await projectResponse.json();

        let n8nUrl = existingUser.n8nUrl;
        if (!n8nUrl) {
          const n8nData = await getN8nHostFromProject(existingUser.northflankProjectId);
          if (n8nData?.n8nUrl) {
            n8nUrl = n8nData.n8nUrl;

            await db.user.update({
              where: { id: userId },
              data: {
                n8nUrl: n8nUrl,
                northflankSecretData: n8nData.allSecrets,
                updatedAt: new Date(),
              },
            });

            if (!existingUser.n8nApiKey && existingUser.n8nEncryptionKey) {
              console.log('Existing project: Attempting to create missing n8n API Key...');
              const fallbackKey = generateApiKey();
              const apiKey = await createN8nApiKey(
                n8nUrl,
                existingUser.n8nEncryptionKey,
                userEmail,
                fallbackKey
              );
              
              if (apiKey) {
                await db.user.update({
                  where: { id: userId },
                  data: { n8nApiKey: apiKey },
                });
                console.log('Existing project: n8n API Key created successfully');
              }
            }
          }
        }

        return NextResponse.json({
          success: true,
          project: {
            id: project.data.id,
            name: project.data.name,
            status: 'existing',
          },
          n8nUrl,
          apiKey: existingUser.n8nApiKey ? '[STORED]' : '[NOT SET]',
          message: 'User already has an existing Northflank project',
        });
      }
    }

    console.log('Creating new project for user...');

    runningMonitors.add(userId);

    try {
      const templateRun = await startSundayTemplate(
        userId, 
        clerkUserId, 
        userName, 
        userEmail
      );
      
      console.log('Template run initiated - starting monitoring');

      await db.user.update({
        where: { id: userId },
        data: {
          northflankWorkflowId: templateRun.data.id,
          n8nUserEmail: userEmail,
          n8nEncryptionKey: templateRun.encryptionKey,
          northflankProjectStatus: 'initiated',
          northflankCreatedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      monitorN8nDeployment(
        templateRun.data.id,
        userId,
        templateRun.encryptionKey,
        userEmail,
        templateRun.apiKey
      ).finally(() => {
        runningMonitors.delete(userId);
      });

      return NextResponse.json({
        success: true,
        method: 'template-ultra-fast-hybrid',
        templateRun: {
          id: templateRun.data.id,
          status: 'initiated',
        },
        message: 'Template deployment initiated with Ollama semantic search!',
        estimatedTime: '5-10 minutes',
        monitoring: 'Ultra-fast monitoring active',
        userCredentials: {
          email: userEmail,
          encryptionKey: templateRun.encryptionKey,
        },
      });
    } catch (templateError) {
      runningMonitors.delete(userId);
      console.error('Template initiation failed:', templateError);

      const manualResult = await createCompleteProject(userId, userName, userEmail);

      await db.user.update({
        where: { id: userId },
        data: {
          northflankProjectId: manualResult.project.id,
          northflankProjectName: manualResult.project.name,
          northflankProjectStatus: 'manual',
          n8nUserEmail: userEmail,
          n8nEncryptionKey: manualResult.encryptionKey,
          northflankCreatedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        method: 'manual',
        project: manualResult.project,
        message: 'Basic project created successfully.',
        userCredentials: {
          email: userEmail,
          encryptionKey: manualResult.encryptionKey,
        },
      });
    }
  } catch (error) {
    const err = error as Error;
    console.error('💥 Error in provision-northflank:', err);

    const body = await request.json().catch(() => ({}));
    if (body.userId) {
      runningMonitors.delete(body.userId);

      try {
        await db.user.update({
          where: { id: body.userId },
          data: {
            northflankProjectStatus: 'failed',
            n8nSetupError: err.message,
            updatedAt: new Date(),
          },
        });
      } catch (dbError) {
        console.error('Failed to update database with error status:', dbError);
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

// ===== HELPER FUNCTIONS =====

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'n8n_';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function startSundayTemplate(
  userId: string,
  clerkUserId: string,
  userName: string,
  userEmail: string
) {
  const nameParts = (userName || '').trim().split(/\s+/);
  const firstName = nameParts[0] || userName || userEmail.split('@')[0];
  const encryptionKey = Math.random().toString(36).substring(2, 34);
  const n8nApiKey = generateApiKey();

  console.log('Generated N8N API Key for fallback:', n8nApiKey.substring(0, 10) + '...[REDACTED]');

  const requiredEnvVars = {
    DATABASE_URL: process.env.DATABASE_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  };

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  const templateRunPayload = {
    arguments: {
      id: userId.substring(0, 8),
      clerk_user_id: clerkUserId,
      user_id: userId,
      user_email: userEmail,
      user_name: firstName,
      webhook_url: WEBHOOK_URL,
      webhook_token: WEBHOOK_AUTH_TOKEN,
      N8N_ENCRYPTION_KEY: encryptionKey,
      neon_database_url: process.env.DATABASE_URL!,
      google_oauth_client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      google_oauth_client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    },
  };

  console.log('Starting Sunday template with Neon database...');

  const response = await fetch('https://api.northflank.com/v1/templates/sunday/runs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(templateRunPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Template run failed:', errorText);
    throw new Error(`Template run failed: ${errorText}`);
  }

  const result = await response.json();
  console.log('✅ Template run started with ID:', result.data.id);

  return {
    ...result,
    encryptionKey,
    apiKey: n8nApiKey,
    status: 'initiated',
  };
}

async function createCompleteProject(userId: string, userName: string, userEmail: string) {
  const projectName = `sunday-${userId.substring(0, 8)}-${Date.now().toString().slice(-6)}`.toLowerCase();
  const encryptionKey = Math.random().toString(36).substring(2, 34);

  const projectResponse = await fetch('https://api.northflank.com/v1/projects', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName,
      description: `N8N Workflow Project for user ${userName}`,
      region: 'asia-southeast',
    }),
  });

  if (!projectResponse.ok) {
    const error = await projectResponse.text();
    throw new Error(`Project creation failed: ${error}`);
  }

  const project = await projectResponse.json();
  const projectId = project.data.id;

  console.log('Manual project created:', projectId);

  return {
    success: true,
    project: {
      id: projectId,
      name: project.data.name,
      status: 'created',
    },
    encryptionKey,
    method: 'manual',
  };
}

async function getProjectIdFromTemplate(templateRunId: string): Promise<string | null> {
  try {
    const runResponse = await fetch(
      `https://api.northflank.com/v1/templates/sunday/runs/${templateRunId}`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!runResponse.ok) {
      console.log('Template run not found yet');
      return null;
    }

    const runDetails = await runResponse.json();
    console.log('Template run status:', runDetails.data?.status);

    if (runDetails.data?.spec?.steps) {
      const projectStep = runDetails.data.spec.steps.find((step: any) => step.kind === 'Project');
      if (projectStep?.response?.data?.id) {
        console.log('✅ Project ID found in workflow steps:', projectStep.response.data.id);
        return projectStep.response.data.id;
      }
    }

    if (runDetails.data?.output?.project_id) {
      console.log('✅ Project ID found in output:', runDetails.data.output.project_id);
      return runDetails.data.output.project_id;
    }

    if (runDetails.data?.results && Array.isArray(runDetails.data.results)) {
      for (const result of runDetails.data.results) {
        if (result.kind === 'Project' && result.data?.id) {
          console.log('✅ Project ID found in results:', result.data.id);
          return result.data.id;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting project ID:', error);
    return null;
  }
}

async function getN8nHostFromProject(projectId: string) {
  try {
    console.log('FAST CHECK: Looking for N8N_HOST in project:', projectId);

    const secretGroupsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/secret-groups`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!secretGroupsResponse.ok) {
      return null;
    }

    const secretGroups = await secretGroupsResponse.json();
    const n8nSecretsGroup = secretGroups.data?.find((sg: any) => sg.name === 'n8n-secrets');

    if (!n8nSecretsGroup) {
      console.log('FAST CHECK: n8n-secrets group not found yet');
      return null;
    }

    const secretDetailsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/secret-groups/${n8nSecretsGroup.id}`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!secretDetailsResponse.ok) {
      return null;
    }

    const secretDetails = await secretDetailsResponse.json();

    if (secretDetails.data?.data?.N8N_HOST && !secretDetails.data.data.N8N_HOST.includes('${refs.')) {
      const n8nUrl = `https://${secretDetails.data.data.N8N_HOST}`;
      console.log('FAST CHECK: N8N_HOST found!', n8nUrl);
      return {
        n8nUrl,
        allSecrets: secretDetails.data.data,
      };
    }

    console.log('FAST CHECK: N8N_HOST not ready (still template variable)');
    return null;
  } catch (error) {
    console.error('FAST CHECK: Error getting N8N_HOST:', error);
    return null;
  }
}

async function createN8nApiKey(
  n8nUrl: string,
  encryptionKey: string,
  userEmail: string,
  preGeneratedKey: string
): Promise<string> {
  try {
    console.log('Creating n8n API Key for URL:', n8nUrl);
    
    console.log('Waiting for N8N to be ready...');
    await new Promise((resolve) => setTimeout(resolve, 30000));

    const password = `7On${encryptionKey}`;
    const credentials = btoa(`${userEmail}:${password}`);

    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`API Key creation attempt ${attempt}/${maxRetries}`);

        const healthCheck = await fetch(`${n8nUrl}/healthz`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!healthCheck.ok) {
          console.log(`Health check failed on attempt ${attempt}, waiting...`);
          await new Promise((resolve) => setTimeout(resolve, 15000 * attempt));
          continue;
        }

        console.log('N8N health check passed, attempting API key creation...');

        const response = await fetch(`${n8nUrl}/rest/api-key`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credentials}`,
          },
          body: JSON.stringify({
            name: `auto-generated-${Date.now()}`,
            expiresAt: null,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          const apiKey = result?.data?.apiKey || result?.data?.key || result?.apiKey;
          
          if (apiKey) {
            console.log('✅ N8N API Key created successfully via REST API');
            return apiKey;
          }
        } else {
          const errorText = await response.text();
          console.error(`API Key creation failed (attempt ${attempt}):`, response.status, errorText);
        }
      } catch (err) {
        console.error(`API Key creation error (attempt ${attempt}):`, (err as Error).message);
      }

      if (attempt < maxRetries) {
        const waitTime = 15000 * attempt;
        console.log(`Waiting ${waitTime / 1000}s before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    console.log('⚠️ REST API method failed, using pre-generated key as fallback');
    return preGeneratedKey;
  } catch (err) {
    console.error('Critical error creating n8n API Key:', (err as Error).message);
    console.log('🔄 Using pre-generated key as fallback');
    return preGeneratedKey;
  }
}

/**
 * ✅ Add ingress for Ollama only (removed Chroma)
 */
async function addOllamaIngress(userProjectId: string) {
  const OLLAMA_PROJECT_ID = process.env.OLLAMA_PROJECT_ID;

  if (!OLLAMA_PROJECT_ID) {
    console.log('⚠️ No Ollama project ID configured');
    return;
  }

  console.log('🔗 Auto-adding Ollama ingress to user project:', userProjectId);

  try {
    // 1. Get current ingress settings
    const getResponse = await fetch(
      `https://api.northflank.com/v1/projects/${OLLAMA_PROJECT_ID}/settings`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!getResponse.ok) {
      console.error('❌ Failed to get Ollama settings:', await getResponse.text());
      return;
    }

    const currentSettings = await getResponse.json();
    const existingProjects = currentSettings.data?.networking?.ingress?.projects || [];

    // 2. Check if already added
    if (existingProjects.includes(userProjectId)) {
      console.log('ℹ️ Ollama: User project already has ingress');
      return;
    }

    // 3. Append new project
    const updatedProjects = [...existingProjects, userProjectId];

    const patchResponse = await fetch(
      `https://api.northflank.com/v1/projects/${OLLAMA_PROJECT_ID}/settings`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          networking: {
            ingress: {
              projects: updatedProjects,
            },
          },
        }),
      }
    );

    if (patchResponse.ok) {
      console.log('✅ Ollama: Ingress added successfully');
    } else {
      console.error('⚠️ Ollama: Ingress update failed:', await patchResponse.text());
    }
  } catch (error) {
    console.error('❌ Ollama: Ingress error:', error);
  }
}

/**
 * ✅ Add Ollama environment variable to n8n (removed Chroma)
 */
async function addOllamaEnvVar(projectId: string, ollamaUrl: string) {
  try {
    console.log('📝 Adding Ollama env var to n8n...');

    const servicesResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/services`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!servicesResponse.ok) {
      console.error('Failed to list services:', await servicesResponse.text());
      return;
    }

    const services = await servicesResponse.json();
    const n8nService = services.data?.find((s: any) => 
      s.name?.includes('n8n') || s.spec?.image?.includes('n8nio')
    );

    if (!n8nService) {
      console.log('❌ n8n service not found in project');
      return;
    }

    console.log('✅ n8n service found:', n8nService.id);

    const updateResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/services/${n8nService.id}/env`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          env: {
            OLLAMA_URL: ollamaUrl,
          },
        }),
      }
    );

    if (updateResponse.ok) {
      console.log('✅ Ollama env var added successfully');
    } else {
      console.error('⚠️ Failed to update env var:', await updateResponse.text());
    }
  } catch (error) {
    console.error('❌ Error adding env var:', error);
  }
}

async function monitorN8nDeployment(
  templateRunId: string,
  userId: string,
  encryptionKey: string,
  userEmail: string,
  preGeneratedApiKey: string
) {
  console.log('ULTRA FAST MONITORING: Started for template', templateRunId);

  const maxWaitTime = 900000; // 15 minutes
  const fastPollInterval = 30000; // 30 seconds
  const startTime = Date.now();
  let projectId: string | null = null;
  let n8nFound = false;

  while (Date.now() - startTime < maxWaitTime && !n8nFound) {
    try {
      // Phase 1: Get project ID
      if (!projectId) {
        console.log('ULTRA FAST: Getting project ID...');
        projectId = await getProjectIdFromTemplate(templateRunId);
        
        if (projectId) {
          console.log('✅ Project ID found:', projectId);
          
          // ✅ Add Ollama ingress only
          console.log('🔗 Setting up Ollama ingress...');
          await addOllamaIngress(projectId);
          
          await db.user.update({
            where: { id: userId },
            data: {
              northflankProjectId: projectId,
              northflankProjectStatus: 'deploying',
              updatedAt: new Date(),
            },
          });
        }
      }

      // Phase 2: Check for N8N_HOST
      if (projectId) {
        console.log('ULTRA FAST: Checking N8N_HOST availability...');
        const n8nData = await getN8nHostFromProject(projectId);
        
        if (n8nData?.n8nUrl) {
          console.log('✅ N8N_HOST FOUND:', n8nData.n8nUrl);
          n8nFound = true;

          let projectName = 'Unknown';
          try {
            const projectResponse = await fetch(
              `https://api.northflank.com/v1/projects/${projectId}`,
              {
                headers: {
                  Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            
            if (projectResponse.ok) {
              const project = await projectResponse.json();
              projectName = project.data.name;
            }
          } catch (e) {
            console.log('Could not get project name:', e);
          }

          // ✅ Ollama internal URL only
          const ollamaUrl = 'http://ollama.internal:11434';

          // ✅ Add Ollama env var
          console.log('📝 Adding Ollama env var to n8n...');
          await addOllamaEnvVar(projectId, ollamaUrl);

          // Create n8n API Key
          console.log('🔑 Creating n8n API Key...');
          const finalApiKey = await createN8nApiKey(
            n8nData.n8nUrl,
            encryptionKey,
            userEmail,
            preGeneratedApiKey
          );

          // ========================================
          // 🗄️ POSTGRES SETUP WITH SEMANTIC SEARCH
          // ========================================
          console.log('🗄️ Starting Postgres + Semantic Search setup...');
          
          let postgresCredentialId: string | null = null;
          let postgresSetupError: string | null = null;
          let postgresSchemaInitialized = false;

          try {
            console.log('📝 Getting Postgres connection...');
            const postgresConnection = await getPostgresConnection(projectId);

            if (!postgresConnection) {
              throw new Error('Failed to get Postgres connection');
            }

            console.log('✅ Postgres connection retrieved');

            console.log('📝 Initializing Postgres schema with pgvector (768-dim)...');
const { initializeEthicalGrowthSchema } = await import('@/lib/postgres-setup');

const schemaSuccess = await initializeEthicalGrowthSchema(
  postgresConnection.connectionString,
  adminConnection?.connectionString
);

            if (!schemaSuccess) {
              throw new Error('Failed to initialize Postgres schema');
            }

            postgresSchemaInitialized = true;
            console.log('✅ Postgres schema + pgvector initialized (768-dim for Ollama)');

            console.log('📝 Creating Postgres credential in n8n...');
            const { createPostgresCredentialInN8n } = await import('@/lib/n8n-credentials');
            
            const credentialId = await createPostgresCredentialInN8n({
              n8nUrl: n8nData.n8nUrl,
              n8nEmail: userEmail,
              n8nPassword: `7On${encryptionKey}`,
              postgresConfig: postgresConnection.config,
            });

            if (!credentialId) {
              throw new Error('Failed to create Postgres credential');
            }

            postgresCredentialId = credentialId;
            console.log('✅ Postgres credential created:', credentialId);

          } catch (postgresError) {
            console.error('❌ Postgres setup failed:', postgresError);
            postgresSetupError = (postgresError as Error).message;
          }

          // Update database with all results
          console.log('💾 Updating database with final results...');
          await db.user.update({
            where: { id: userId },
            data: {
              n8nUrl: n8nData.n8nUrl,
              n8nUserEmail: userEmail,
              n8nEncryptionKey: encryptionKey,
              n8nApiKey: finalApiKey,
              northflankProjectId: projectId,
              northflankProjectName: projectName,
              northflankProjectStatus: 'ready',
              northflankSecretData: n8nData.allSecrets,
              templateCompletedAt: new Date(),
              postgresSchemaInitialized,
              n8nPostgresCredentialId: postgresCredentialId,
              postgresSetupError,
              postgresSetupAt: postgresSchemaInitialized ? new Date() : null,
              updatedAt: new Date(),
            },
          });

          if (postgresSchemaInitialized && postgresCredentialId) {
            console.log('🎉 COMPLETE: N8N + Postgres + Ollama Semantic Search ready!');
          } else {
            console.log('⚠️ PARTIAL: N8N + Ollama ready, but Postgres had issues');
          }
          
          return;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, fastPollInterval));
    } catch (error) {
      console.error('ULTRA FAST: Monitoring error:', error);
      await new Promise((resolve) => setTimeout(resolve, fastPollInterval));
    }
  }

  console.log('ULTRA FAST: Timeout reached without finding N8N_HOST');
  await db.user.update({
    where: { id: userId },
    data: {
      northflankProjectStatus: 'timeout',
      n8nSetupError: 'N8N_HOST not available within time limit',
      updatedAt: new Date(),
    },
  });
}

async function getPostgresConnection(projectId: string) {
  try {
    console.log('Getting Postgres connection for project:', projectId);
    
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
      console.error('Failed to list addons:', await addonsResponse.text());
      return null;
    }

    const addons = await addonsResponse.json();
    const postgresAddon = addons.data?.find(
      (addon: any) => addon.spec?.type === 'postgresql'
    );

    if (!postgresAddon) {
      console.log('❌ No Postgres addon found in project');
      return null;
    }

    console.log('✅ Postgres addon found:', postgresAddon.id);

    // Enable external access if needed
    if (!postgresAddon.spec?.externalAccessEnabled) {
      await fetch(
        `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ spec: { externalAccessEnabled: true } }),
        }
      );
      
      await new Promise(resolve => setTimeout(resolve, 15000));
    }

    // Resume if paused
    if (postgresAddon.status === 'paused') {
      await fetch(
        `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}/resume`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      await new Promise(resolve => setTimeout(resolve, 30000));
    }

    if (postgresAddon.status !== 'running') {
      console.log('⚠️ Postgres addon not running yet');
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
      console.error('Failed to get credentials:', await credentialsResponse.text());
      return null;
    }

    const credentials = await credentialsResponse.json();
    const envs = credentials.data?.envs;

    const adminConnectionString = envs?.EXTERNAL_POSTGRES_URI_ADMIN || envs?.POSTGRES_URI_ADMIN;
    const connectionString = envs?.EXTERNAL_POSTGRES_URI || envs?.POSTGRES_URI;

    if (!connectionString) {
      console.log('❌ No connection string found');
      return null;
    }

    const parsed = parsePostgresUrl(connectionString);
    if (!parsed) {
      console.log('❌ Failed to parse connection string');
      return null;
    }

    console.log('✅ Postgres connection details retrieved');

    return {
      connectionString,
      adminConnectionString: adminConnectionString || connectionString,
      config: parsed,
    };
  } catch (error) {
    console.error('❌ Error getting Postgres connection:', error);
    return null;
  }
}

function parsePostgresUrl(url: string) {
  try {
    const regex = /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/;
    const match = url.match(regex);
    if (!match) return null;
    
    const [, user, password, host, port, database] = match;
    
    return { host, port: parseInt(port), database, user, password };
  } catch {
    return null;
  }
}