// apps/app/app/api/lora/sync-counts/route.ts - FIXED: Include Review Queue
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import { Client } from 'pg';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;

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
        postgresSchemaInitialized: true 
      },
    });

    if (!user?.northflankProjectId || !user.postgresSchemaInitialized) {
      return NextResponse.json(
        { error: 'Database not initialized' }, 
        { status: 400 }
      );
    }

    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    if (!connectionString) {
      return NextResponse.json(
        { error: 'Cannot connect to database' }, 
        { status: 500 }
      );
    }

    const client = new Client({ connectionString });
    await client.connect();

    try {
      console.log(`📊 Syncing counts for user: ${user.id}`);

      // ✅ Count from ALL channel tables
      
      // 1. Good Channel
      const goodResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM user_data_schema.stm_good 
        WHERE user_id = $1
      `, [user.id]);

      // 2. Bad Channel
      const badResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM user_data_schema.stm_bad 
        WHERE user_id = $1
      `, [user.id]);

      // 3. MCL Chains
      const mclResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM user_data_schema.mcl_chains 
        WHERE user_id = $1
      `, [user.id]);

      // 4. Review Queue (✅ NEW - นับด้วย!)
      const reviewResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM user_data_schema.stm_review 
        WHERE user_id = $1
      `, [user.id]);

      // 5. Total memory_embeddings (for reference)
      const memoryResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM user_data_schema.memory_embeddings 
        WHERE user_id = $1
      `, [user.id]);

      // Parse counts
      const goodCount = parseInt(goodResult.rows[0]?.count || '0');
      const badCount = parseInt(badResult.rows[0]?.count || '0');
      const mclCount = parseInt(mclResult.rows[0]?.count || '0');
      const reviewCount = parseInt(reviewResult.rows[0]?.count || '0');
      const memoryCount = parseInt(memoryResult.rows[0]?.count || '0');

      console.log('📊 Counts from channels:', {
        good: goodCount,
        bad: badCount,
        mcl: mclCount,
        review: reviewCount,
        memory_embeddings: memoryCount,
      });

      // Update Prisma database
      await db.user.update({
        where: { id: user.id },
        data: {
          goodChannelCount: goodCount,
          badChannelCount: badCount,
          mclChainCount: mclCount,
          updatedAt: new Date(),
        },
      });

      console.log('✅ Counts synced to Prisma');

      return NextResponse.json({
        success: true,
        counts: {
          goodChannel: goodCount,
          badChannel: badCount,
          mclChains: mclCount,
          reviewQueue: reviewCount,
          memoryEmbeddings: memoryCount,
          total: goodCount + badCount + mclCount + reviewCount, // ✅ รวม Review ด้วย
        },
        message: `Synced ${goodCount + badCount + mclCount + reviewCount} total records`,
      });

    } finally {
      await client.end();
    }

  } catch (error) {
    console.error('❌ Sync counts error:', error);
    return NextResponse.json(
      { error: (error as Error).message }, 
      { status: 500 }
    );
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