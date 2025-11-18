// apps/app/app/api/memories/setup/route.ts - FIXED VERSION
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Memory setup API called');
    
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      console.error('❌ Unauthorized - no clerk user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log('✅ Authenticated:', clerkUserId);
    
    // Get user from database
    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: {
        id: true,
        northflankProjectId: true,
        postgresSchemaInitialized: true,
        n8nPostgresCredentialId: true,
        n8nUrl: true,
        n8nUserEmail: true,
        n8nEncryptionKey: true,
        email: true,
        northflankProjectStatus: true,
      },
    });
    
    if (!user) {
      console.error('❌ User not found in database');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    console.log('📊 User status:', {
      hasProject: !!user.northflankProjectId,
      projectStatus: user.northflankProjectStatus,
      schemaInitialized: user.postgresSchemaInitialized,
      hasCredential: !!user.n8nPostgresCredentialId,
      hasN8nUrl: !!user.n8nUrl,
    });
    
    // Already initialized
    if (user.postgresSchemaInitialized && user.n8nPostgresCredentialId) {
      console.log('ℹ️ Already initialized');
      return NextResponse.json({
        success: true,
        message: 'Database already initialized',
        credentialId: user.n8nPostgresCredentialId,
      });
    }
    
    // Validate prerequisites
    if (!user.northflankProjectId) {
      console.error('❌ No Northflank project');
      return NextResponse.json(
        { error: 'No Northflank project found. Please wait for deployment to complete.' },
        { status: 400 }
      );
    }
    
    if (user.northflankProjectStatus !== 'ready') {
      console.error('❌ Project not ready:', user.northflankProjectStatus);
      return NextResponse.json(
        { 
          error: `Project not ready yet. Current status: ${user.northflankProjectStatus}`,
          status: user.northflankProjectStatus,
        },
        { status: 400 }
      );
    }
    
    if (!user.n8nUrl || !user.n8nEncryptionKey) {
      console.error('❌ N8N not configured');
      return NextResponse.json(
        { error: 'N8N configuration missing. Please contact support.' },
        { status: 400 }
      );
    }
    
    console.log('✅ Prerequisites validated');
    
    // Get Postgres connection
    console.log('📝 Step 1: Getting Postgres connection...');
    const postgresConnection = await getPostgresConnection(user.northflankProjectId);
    
    if (!postgresConnection) {
      console.error('❌ Failed to get Postgres connection');
      return NextResponse.json(
        { error: 'Failed to connect to database. Please try again.' },
        { status: 500 }
      );
    }
    
    console.log('✅ Postgres connection retrieved');
    
    // Initialize schema
    console.log('📝 Step 2: Initializing database schema...');
    
    try {
      const { initializeEthicalGrowthSchema } = await import('@/lib/postgres-setup');
      
      const schemaSuccess = await initializeEthicalGrowthSchema(
        postgresConnection.connectionString,
        postgresConnection.adminConnectionString
      );
      
      if (!schemaSuccess) {
        throw new Error('Schema initialization returned false');
      }
      
      console.log('✅ Schema initialized successfully');
    } catch (schemaError) {
      console.error('❌ Schema initialization error:', schemaError);
      
      const errorMessage = schemaError instanceof Error ? schemaError.message : 'Unknown error';
      
      await db.user.update({
        where: { id: user.id },
        data: {
          postgresSetupError: `Schema error: ${errorMessage}`,
          updatedAt: new Date(),
        },
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to initialize database schema',
          details: errorMessage,
        },
        { status: 500 }
      );
    }
    
    // Create N8N credential
    console.log('📝 Step 3: Creating N8N PostgreSQL credential...');
    
    try {
      const { createPostgresCredentialInN8n } = await import('@/lib/n8n-credentials');
      
      const n8nEmail = user.n8nUserEmail || user.email;
      const n8nPassword = `7On${user.n8nEncryptionKey}`;
      
      if (!postgresConnection.config) {
        throw new Error('Missing Postgres config');
      }
      
      console.log('Creating credential with:', {
        n8nUrl: user.n8nUrl,
        email: n8nEmail,
        hasPassword: !!n8nPassword,
        hasConfig: !!postgresConnection.config,
      });
      
      const credentialId = await createPostgresCredentialInN8n({
        n8nUrl: user.n8nUrl,
        n8nEmail,
        n8nPassword,
        postgresConfig: postgresConnection.config,
      });
      
      if (!credentialId) {
        throw new Error('No credential ID returned from N8N');
      }
      
      console.log('✅ N8N credential created:', credentialId);
      
      // Update database with success
      await db.user.update({
        where: { id: user.id },
        data: {
          postgresSchemaInitialized: true,
          n8nPostgresCredentialId: credentialId,
          postgresSetupError: null,
          postgresSetupAt: new Date(),
          updatedAt: new Date(),
        },
      });
      
      console.log('✅ Database updated with credential info');
      console.log('🎉 Setup completed successfully!');
      
      return NextResponse.json({
        success: true,
        message: 'Database setup completed successfully',
        credentialId,
      });
      
    } catch (credError) {
      console.error('❌ N8N credential creation error:', credError);
      
      const errorMessage = credError instanceof Error ? credError.message : 'Unknown error';
      
      // Mark schema as initialized but save credential error
      await db.user.update({
        where: { id: user.id },
        data: {
          postgresSchemaInitialized: true,
          postgresSetupError: `Credential error: ${errorMessage}`,
          updatedAt: new Date(),
        },
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to create N8N credential',
          details: errorMessage,
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('💥 Unexpected setup error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: 'Setup failed unexpectedly',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

// ===== Helper Functions =====

async function getPostgresConnection(projectId: string) {
  try {
    console.log('Getting Postgres addon for project:', projectId);
    
    // Get addons list
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
      const errorText = await addonsResponse.text();
      console.error('Failed to list addons:', errorText);
      return null;
    }
    
    const addonsData = await addonsResponse.json();
    const addons = addonsData.data?.addons || [];
    
    console.log(`Found ${addons.length} addons`);
    
    const postgresAddon = addons.find((a: any) => a.spec?.type === 'postgresql');
    
    if (!postgresAddon) {
      console.error('No PostgreSQL addon found');
      return null;
    }
    
    console.log('✅ Postgres addon found:', {
      id: postgresAddon.id,
      status: postgresAddon.status,
      externalAccess: postgresAddon.spec?.externalAccessEnabled,
    });
    
    // Enable external access if needed
    if (!postgresAddon.spec?.externalAccessEnabled) {
      console.log('Enabling external access...');
      
      await fetch(
        `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            spec: { externalAccessEnabled: true } 
          }),
        }
      );
      
      console.log('Waiting for external access to be enabled...');
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
    
    // Resume if paused
    if (postgresAddon.status === 'paused') {
      console.log('Resuming paused addon...');
      
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
      
      console.log('Waiting for addon to start...');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    if (postgresAddon.status !== 'running') {
      console.error('Postgres addon not running:', postgresAddon.status);
      return null;
    }
    
    // Get credentials
    console.log('Getting Postgres credentials...');
    
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
      const errorText = await credentialsResponse.text();
      console.error('Failed to get credentials:', errorText);
      return null;
    }
    
    const credentials = await credentialsResponse.json();
    const envs = credentials.data?.envs;
    
    if (!envs) {
      console.error('No credentials env found');
      return null;
    }
    
    const adminConnectionString = envs.EXTERNAL_POSTGRES_URI_ADMIN || envs.POSTGRES_URI_ADMIN;
    const connectionString = envs.EXTERNAL_POSTGRES_URI || envs.POSTGRES_URI;
    
    if (!connectionString) {
      console.error('No connection string found in credentials');
      return null;
    }
    
    console.log('✅ Connection string retrieved');
    
    // Parse connection string
    const parsed = parsePostgresUrl(connectionString);
    if (!parsed) {
      console.error('Failed to parse connection string');
      return null;
    }
    
    console.log('✅ Connection string parsed:', {
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      user: parsed.user,
    });
    
    return {
      connectionString,
      adminConnectionString: adminConnectionString || connectionString,
      config: parsed,
    };
    
  } catch (error) {
    console.error('Error getting Postgres connection:', error);
    return null;
  }
}

function parsePostgresUrl(url: string) {
  try {
    const regex = /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/;
    const match = url.match(regex);
    
    if (!match) {
      console.error('Failed to match regex pattern');
      return null;
    }
    
    const [, user, password, host, port, database] = match;
    
    return { 
      host, 
      port: parseInt(port), 
      database, 
      user, 
      password 
    };
  } catch (error) {
    console.error('Error parsing URL:', error);
    return null;
  }
}