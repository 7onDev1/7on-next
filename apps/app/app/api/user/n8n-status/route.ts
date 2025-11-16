// apps/app/app/api/user/n8n-status/route.ts - FIXED: Correct field mapping
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      console.error('❌ Unauthorized - no clerkUserId');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔍 N8N Status API - Clerk User:', clerkUserId);

    // Find user by Clerk ID
    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: {
        id: true,
        n8nUrl: true,
        n8nUserEmail: true,
        northflankProjectId: true,
        northflankProjectName: true,
        northflankProjectStatus: true,
        templateCompletedAt: true,
        n8nSetupError: true,
        // Postgres fields
        postgresSchemaInitialized: true,
        n8nPostgresCredentialId: true,
        postgresSetupError: true,
        postgresSetupAt: true,
      },
    });

    if (!user) {
      console.error('❌ User not found for Clerk ID:', clerkUserId);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('✅ Found user:', {
      id: user.id,
      projectStatus: user.northflankProjectStatus,
      schemaInit: user.postgresSchemaInitialized,
      hasCredential: !!user.n8nPostgresCredentialId,
    });

    // Count credentials
    const injectedProviders = await db.socialCredential.count({
      where: { userId: user.id, injectedToN8n: true },
    });

    const totalProviders = await db.socialCredential.count({
      where: { userId: user.id },
    });

    // ✅ FIX: Return data with CORRECT field names matching what client expects
    const responseData = {
      // N8N status
      n8n_ready: user.northflankProjectStatus === 'ready' && !!user.n8nUrl,
      n8n_url: user.n8nUrl,
      n8n_user_email: user.n8nUserEmail,
      
      // Northflank status - ✅ CRITICAL: Use snake_case names
      northflank_project_id: user.northflankProjectId,
      northflank_project_name: user.northflankProjectName,
      northflank_project_status: user.northflankProjectStatus, // ← This is the key field!
      
      // Template status
      template_completed_at: user.templateCompletedAt,
      
      // Provider counts
      injected_providers_count: injectedProviders,
      social_providers_count: totalProviders,
      
      // Setup errors
      setup_error: user.n8nSetupError,
      
      // ✅ Postgres status - CRITICAL fields for memory button
      postgres_schema_initialized: user.postgresSchemaInitialized, // ← This!
      n8n_postgres_credential_id: user.n8nPostgresCredentialId,    // ← And this!
      postgres_setup_error: user.postgresSetupError,
      postgres_setup_at: user.postgresSetupAt,
    };

    console.log('📤 Returning data:', {
      projectStatus: responseData.northflank_project_status,
      schemaInit: responseData.postgres_schema_initialized,
      hasCredential: !!responseData.n8n_postgres_credential_id,
    });

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('💥 N8N Status API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}