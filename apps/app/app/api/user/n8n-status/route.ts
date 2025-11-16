// apps/app/app/api/user/n8n-status/route.ts - FINAL FIX
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      console.error('❌ [n8n-status] Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔍 [n8n-status] Fetching user:', clerkUserId);

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
        postgresSchemaInitialized: true,
        n8nPostgresCredentialId: true,
        postgresSetupError: true,
        postgresSetupAt: true,
      },
    });

    if (!user) {
      console.error('❌ [n8n-status] User not found');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Count credentials
    const [injectedCount, totalCount] = await Promise.all([
      db.socialCredential.count({
        where: { userId: user.id, injectedToN8n: true },
      }),
      db.socialCredential.count({
        where: { userId: user.id },
      }),
    ]);

    const responseData = {
      n8n_ready: user.northflankProjectStatus === 'ready' && !!user.n8nUrl,
      n8n_url: user.n8nUrl,
      n8n_user_email: user.n8nUserEmail,
      northflank_project_id: user.northflankProjectId,
      northflank_project_name: user.northflankProjectName,
      northflank_project_status: user.northflankProjectStatus,
      template_completed_at: user.templateCompletedAt,
      injected_providers_count: injectedCount,
      social_providers_count: totalCount,
      setup_error: user.n8nSetupError,
      postgres_schema_initialized: user.postgresSchemaInitialized,
      n8n_postgres_credential_id: user.n8nPostgresCredentialId,
      postgres_setup_error: user.postgresSetupError,
      postgres_setup_at: user.postgresSetupAt,
    };

    console.log('✅ [n8n-status] Response:', {
      projectStatus: responseData.northflank_project_status,
      schemaInitialized: responseData.postgres_schema_initialized,
      hasCredential: !!responseData.n8n_postgres_credential_id,
      injectedProviders: responseData.injected_providers_count,
    });

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('💥 [n8n-status] Error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}