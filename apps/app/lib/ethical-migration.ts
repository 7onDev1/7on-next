// apps/app/lib/ethical-migration.ts
/**
 * 🔄 Migration: Legacy Two-Channel → Ethical Growth System
 * Run once to migrate existing user data
 */

import { Client } from 'pg';

interface MigrationResult {
  success: boolean;
  migrated: {
    good: number;
    bad: number;
    review: number;
    mcl: number;
    total: number;
  };
  errors: string[];
}

/**
 * Main migration function
 */
export async function migrateToEthicalGrowth(
  connectionString: string,
  userId?: string
): Promise<MigrationResult> {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('🔄 Starting Ethical Growth Migration...');
    
    const errors: string[] = [];
    const migrated = { good: 0, bad: 0, review: 0, mcl: 0, total: 0 };
    
    // Create ethical_profiles if not exists
    await initializeEthicalProfile(client, userId);
    
    // Migrate stm_good → growth_memory
    try {
      const goodResult = await migrateGoodChannel(client, userId);
      migrated.good = goodResult;
      console.log(`✅ Migrated ${goodResult} good channel records`);
    } catch (error) {
      errors.push(`Good channel: ${(error as Error).message}`);
    }
    
    // Migrate stm_bad → challenge_memory
    try {
      const badResult = await migrateBadChannel(client, userId);
      migrated.bad = badResult;
      console.log(`✅ Migrated ${badResult} bad channel records`);
    } catch (error) {
      errors.push(`Bad channel: ${(error as Error).message}`);
    }
    
    // Migrate stm_review → neutral_interaction
    try {
      const reviewResult = await migrateReviewQueue(client, userId);
      migrated.review = reviewResult;
      console.log(`✅ Migrated ${reviewResult} review queue records`);
    } catch (error) {
      errors.push(`Review queue: ${(error as Error).message}`);
    }
    
    // Migrate mcl_chains → wisdom_moment
    try {
      const mclResult = await migrateMCLChains(client, userId);
      migrated.mcl = mclResult;
      console.log(`✅ Migrated ${mclResult} MCL chains`);
    } catch (error) {
      errors.push(`MCL chains: ${(error as Error).message}`);
    }
    
    migrated.total = migrated.good + migrated.bad + migrated.review + migrated.mcl;
    
    // Update ethical profile stats
    if (userId) {
      await updateEthicalProfile(client, userId);
    }
    
    console.log(`🎉 Migration completed: ${migrated.total} total records`);
    
    return {
      success: errors.length === 0,
      migrated,
      errors,
    };
    
  } catch (error) {
    console.error('❌ Migration error:', error);
    return {
      success: false,
      migrated: { good: 0, bad: 0, review: 0, mcl: 0, total: 0 },
      errors: [(error as Error).message],
    };
  } finally {
    await client.end();
  }
}

/**
 * Initialize ethical profile for user
 */
async function initializeEthicalProfile(client: Client, userId?: string) {
  const whereClause = userId ? `WHERE user_id = '${userId}'` : '';
  
  await client.query(`
    INSERT INTO user_data_schema.ethical_profiles (user_id)
    SELECT DISTINCT user_id 
    FROM user_data_schema.stm_good 
    ${whereClause}
    ON CONFLICT (user_id) DO NOTHING
  `);
}

/**
 * Migrate good channel → growth_memory
 */
async function migrateGoodChannel(client: Client, userId?: string): Promise<number> {
  const whereClause = userId 
    ? `AND sg.user_id = '${userId}' AND sg.migrated_to_interaction_memory = FALSE`
    : `AND sg.migrated_to_interaction_memory = FALSE`;
  
  const result = await client.query(`
    WITH inserted AS (
      INSERT INTO user_data_schema.interaction_memories 
        (user_id, text, embedding, classification, ethical_scores, 
         approved_for_training, training_weight, metadata, created_at)
      SELECT 
        sg.user_id,
        sg.text,
        sg.embedding,
        'growth_memory' as classification,
        jsonb_build_object(
          'self_awareness', COALESCE(sg.alignment_score, 0.6),
          'emotional_regulation', 0.6,
          'compassion', 0.6,
          'integrity', 0.7,
          'growth_mindset', 0.7,
          'wisdom', 0.6,
          'transcendence', 0.4
        ) as ethical_scores,
        sg.approved_for_consolidation as approved_for_training,
        1.5 as training_weight,
        jsonb_build_object(
          'legacy_channel', 'good',
          'legacy_id', sg.id,
          'alignment_score', sg.alignment_score,
          'quality_score', sg.quality_score,
          'original_metadata', sg.metadata
        ) as metadata,
        sg.created_at
      FROM user_data_schema.stm_good sg
      WHERE 1=1 ${whereClause}
      RETURNING id
    )
    SELECT COUNT(*) as count FROM inserted
  `);
  
  const count = parseInt(result.rows[0]?.count || '0');
  
  // Mark as migrated
  await client.query(`
    UPDATE user_data_schema.stm_good
    SET migrated_to_interaction_memory = TRUE
    WHERE migrated_to_interaction_memory = FALSE
    ${userId ? `AND user_id = '${userId}'` : ''}
  `);
  
  return count;
}

/**
 * Migrate bad channel → challenge_memory
 */
async function migrateBadChannel(client: Client, userId?: string): Promise<number> {
  const whereClause = userId 
    ? `AND sb.user_id = '${userId}' AND sb.migrated_to_interaction_memory = FALSE`
    : `AND sb.migrated_to_interaction_memory = FALSE`;
  
  const result = await client.query(`
    WITH inserted AS (
      INSERT INTO user_data_schema.interaction_memories 
        (user_id, text, embedding, classification, ethical_scores, 
         gentle_guidance, approved_for_training, training_weight, metadata, created_at)
      SELECT 
        sb.user_id,
        sb.text,
        sb.embedding,
        'challenge_memory' as classification,
        jsonb_build_object(
          'self_awareness', GREATEST(0.3, 1.0 - COALESCE(sb.severity_score, 0.5)),
          'emotional_regulation', GREATEST(0.2, 1.0 - COALESCE(sb.toxicity_score, 0.5)),
          'compassion', 0.4,
          'integrity', 0.4,
          'growth_mindset', 0.5,
          'wisdom', 0.4,
          'transcendence', 0.2
        ) as ethical_scores,
        sb.safe_counterfactual as gentle_guidance,
        sb.approved_for_shadow_learning as approved_for_training,
        2.0 as training_weight,
        jsonb_build_object(
          'legacy_channel', 'bad',
          'legacy_id', sb.id,
          'shadow_tag', sb.shadow_tag,
          'severity_score', sb.severity_score,
          'toxicity_score', sb.toxicity_score,
          'original_metadata', sb.metadata
        ) as metadata,
        sb.created_at
      FROM user_data_schema.stm_bad sb
      WHERE 1=1 ${whereClause}
      RETURNING id
    )
    SELECT COUNT(*) as count FROM inserted
  `);
  
  const count = parseInt(result.rows[0]?.count || '0');
  
  await client.query(`
    UPDATE user_data_schema.stm_bad
    SET migrated_to_interaction_memory = TRUE
    WHERE migrated_to_interaction_memory = FALSE
    ${userId ? `AND user_id = '${userId}'` : ''}
  `);
  
  return count;
}

/**
 * Migrate review queue → neutral_interaction
 */
async function migrateReviewQueue(client: Client, userId?: string): Promise<number> {
  const whereClause = userId 
    ? `AND sr.user_id = '${userId}' AND sr.migrated_to_interaction_memory = FALSE`
    : `AND sr.migrated_to_interaction_memory = FALSE`;
  
  const result = await client.query(`
    WITH inserted AS (
      INSERT INTO user_data_schema.interaction_memories 
        (user_id, text, embedding, classification, ethical_scores, 
         approved_for_training, training_weight, metadata, created_at)
      SELECT 
        sr.user_id,
        sr.text,
        sr.embedding,
        'neutral_interaction' as classification,
        jsonb_build_object(
          'self_awareness', 0.5,
          'emotional_regulation', 0.5,
          'compassion', 0.5,
          'integrity', 0.5,
          'growth_mindset', 0.5,
          'wisdom', 0.5,
          'transcendence', 0.3
        ) as ethical_scores,
        FALSE as approved_for_training,
        0.5 as training_weight,
        jsonb_build_object(
          'legacy_channel', 'review',
          'legacy_id', sr.id,
          'gating_reason', sr.gating_reason,
          'human_reviewed', sr.human_reviewed,
          'original_metadata', sr.metadata
        ) as metadata,
        sr.created_at
      FROM user_data_schema.stm_review sr
      WHERE 1=1 ${whereClause}
      RETURNING id
    )
    SELECT COUNT(*) as count FROM inserted
  `);
  
  const count = parseInt(result.rows[0]?.count || '0');
  
  await client.query(`
    UPDATE user_data_schema.stm_review
    SET migrated_to_interaction_memory = TRUE
    WHERE migrated_to_interaction_memory = FALSE
    ${userId ? `AND user_id = '${userId}'` : ''}
  `);
  
  return count;
}

/**
 * Migrate MCL chains → wisdom_moment
 */
async function migrateMCLChains(client: Client, userId?: string): Promise<number> {
  const whereClause = userId 
    ? `AND mc.user_id = '${userId}' AND mc.migrated_to_interaction_memory = FALSE`
    : `AND mc.migrated_to_interaction_memory = FALSE`;
  
  const result = await client.query(`
    WITH inserted AS (
      INSERT INTO user_data_schema.interaction_memories 
        (user_id, text, embedding, classification, ethical_scores, 
         approved_for_training, training_weight, metadata, created_at)
      SELECT 
        mc.user_id,
        COALESCE(mc.summary, 'Complex moral reasoning chain') as text,
        mc.embedding,
        'wisdom_moment' as classification,
        jsonb_build_object(
          'self_awareness', COALESCE(mc.intention_score, 0.6),
          'emotional_regulation', 0.6,
          'compassion', COALESCE(mc.benefit_score, 0.6),
          'integrity', 0.7,
          'growth_mindset', 0.7,
          'wisdom', GREATEST(0.6, COALESCE(mc.necessity_score, 0.6)),
          'transcendence', 0.5
        ) as ethical_scores,
        mc.approved_for_training,
        2.5 as training_weight,
        jsonb_build_object(
          'legacy_channel', 'mcl',
          'legacy_id', mc.id,
          'event_chain', mc.event_chain,
          'moral_classification', mc.moral_classification,
          'intention_score', mc.intention_score,
          'necessity_score', mc.necessity_score,
          'harm_score', mc.harm_score,
          'benefit_score', mc.benefit_score
        ) as metadata,
        mc.created_at
      FROM user_data_schema.mcl_chains mc
      WHERE 1=1 ${whereClause}
      RETURNING id
    )
    SELECT COUNT(*) as count FROM inserted
  `);
  
  const count = parseInt(result.rows[0]?.count || '0');
  
  await client.query(`
    UPDATE user_data_schema.mcl_chains
    SET migrated_to_interaction_memory = TRUE
    WHERE migrated_to_interaction_memory = FALSE
    ${userId ? `AND user_id = '${userId}'` : ''}
  `);
  
  return count;
}

/**
 * Update ethical profile with statistics
 */
async function updateEthicalProfile(client: Client, userId: string) {
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
      COUNT(CASE WHEN classification = 'growth_memory' THEN 1 END) as growth_count,
      COUNT(CASE WHEN classification = 'wisdom_moment' THEN 1 END) as wisdom_count
    FROM user_data_schema.interaction_memories
    WHERE user_id = $1
  `, [userId]);
  
  const stats = result.rows[0];
  
  if (stats && stats.total_interactions > 0) {
    const avgScore = (
      parseFloat(stats.avg_self_awareness || 0.5) +
      parseFloat(stats.avg_emotional_regulation || 0.5) +
      parseFloat(stats.avg_compassion || 0.5) +
      parseFloat(stats.avg_integrity || 0.5) +
      parseFloat(stats.avg_growth_mindset || 0.5) +
      parseFloat(stats.avg_wisdom || 0.5) +
      parseFloat(stats.avg_transcendence || 0.3)
    ) / 7;
    
    let growthStage = 2; // Default: Conventional
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
        updated_at = NOW()
      WHERE user_id = $11
    `, [
      parseFloat(stats.avg_self_awareness || 0.5),
      parseFloat(stats.avg_emotional_regulation || 0.5),
      parseFloat(stats.avg_compassion || 0.5),
      parseFloat(stats.avg_integrity || 0.5),
      parseFloat(stats.avg_growth_mindset || 0.5),
      parseFloat(stats.avg_wisdom || 0.5),
      parseFloat(stats.avg_transcendence || 0.3),
      growthStage,
      parseInt(stats.total_interactions),
      parseInt(stats.wisdom_count || 0),
      userId
    ]);
  }
}

/**
 * Check migration status
 */
export async function checkMigrationStatus(
  connectionString: string,
  userId?: string
): Promise<{
  needsMigration: boolean;
  legacy: { good: number; bad: number; review: number; mcl: number };
  ethical: { total: number; approved: number };
}> {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    const whereClause = userId ? `WHERE user_id = '${userId}'` : '';
    
    // Check legacy tables
    const [good, bad, review, mcl] = await Promise.all([
      client.query(`SELECT COUNT(*) FROM user_data_schema.stm_good ${whereClause} AND migrated_to_interaction_memory = FALSE`),
      client.query(`SELECT COUNT(*) FROM user_data_schema.stm_bad ${whereClause} AND migrated_to_interaction_memory = FALSE`),
      client.query(`SELECT COUNT(*) FROM user_data_schema.stm_review ${whereClause} AND migrated_to_interaction_memory = FALSE`),
      client.query(`SELECT COUNT(*) FROM user_data_schema.mcl_chains ${whereClause} AND migrated_to_interaction_memory = FALSE`),
    ]);
    
    const legacy = {
      good: parseInt(good.rows[0]?.count || '0'),
      bad: parseInt(bad.rows[0]?.count || '0'),
      review: parseInt(review.rows[0]?.count || '0'),
      mcl: parseInt(mcl.rows[0]?.count || '0'),
    };
    
    // Check ethical system
    const ethicalResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN approved_for_training THEN 1 END) as approved
      FROM user_data_schema.interaction_memories
      ${whereClause}
    `);
    
    const ethical = {
      total: parseInt(ethicalResult.rows[0]?.total || '0'),
      approved: parseInt(ethicalResult.rows[0]?.approved || '0'),
    };
    
    const needsMigration = 
      legacy.good > 0 || 
      legacy.bad > 0 || 
      legacy.review > 0 || 
      legacy.mcl > 0;
    
    return { needsMigration, legacy, ethical };
    
  } finally {
    await client.end();
  }
}