// lib/postgres-setup.ts
/**
 * 🌟 Ethical Growth System - Complete Postgres Schema
 * Migration from Two-Channel to Ethical Growth Architecture
 */

import { Client } from 'pg';

export async function initializeEthicalGrowthSchema(
  connectionString: string,
  adminConnectionString?: string
): Promise<boolean> {
  const setupConnectionString = adminConnectionString || connectionString;
  const client = new Client({ connectionString: setupConnectionString });
  
  try {
    await client.connect();
    console.log('✅ Connected to User Postgres');
    
    // ========================================
    // STEP 1: Extensions & Schema
    // ========================================
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    console.log('✅ pgvector extension enabled');
    
    await client.query(`CREATE SCHEMA IF NOT EXISTS user_data_schema`);
    console.log('✅ Schema: user_data_schema');
    
    // ========================================
    // STEP 2: Ethical Profiles (User's Journey)
    // ========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.ethical_profiles (
        user_id TEXT PRIMARY KEY,
        
        -- 7 Ethical Dimensions (0-1 scores)
        self_awareness FLOAT DEFAULT 0.3,
        emotional_regulation FLOAT DEFAULT 0.4,
        compassion FLOAT DEFAULT 0.4,
        integrity FLOAT DEFAULT 0.5,
        growth_mindset FLOAT DEFAULT 0.4,
        wisdom FLOAT DEFAULT 0.3,
        transcendence FLOAT DEFAULT 0.2,
        
        -- Growth Stage (1-5)
        growth_stage INT DEFAULT 2,
        
        -- Tracking
        total_interactions INT DEFAULT 0,
        breakthrough_moments INT DEFAULT 0,
        crisis_interventions INT DEFAULT 0,
        
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_calculated_at TIMESTAMPTZ
      )
    `);
    console.log('✅ Table: ethical_profiles');
    
    // ========================================
    // STEP 3: Interaction Memories (Classified Data)
    // ========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.interaction_memories (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        
        -- Content
        text TEXT NOT NULL,
        embedding vector(768),
        
        -- Classification
        classification TEXT NOT NULL, -- growth_memory, challenge_memory, wisdom_moment, needs_support, neutral_interaction
        
        -- Ethical Analysis
        ethical_scores JSONB NOT NULL DEFAULT '{}', -- 7 dimensions
        moments JSONB DEFAULT '[]', -- breakthrough, struggle, crisis, growth
        
        -- AI Guidance
        reflection_prompt TEXT,
        gentle_guidance TEXT,
        
        -- Training Status
        approved_for_training BOOLEAN DEFAULT FALSE,
        training_weight FLOAT DEFAULT 1.0, -- Higher weight for growth moments
        
        -- Metadata
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Table: interaction_memories');
    
    // ========================================
    // STEP 4: Memory Embeddings (Semantic Search)
    // ========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.memory_embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding vector(768),
        
        -- Link to interaction memory
        interaction_memory_id BIGINT,
        
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Table: memory_embeddings');
    
    // ========================================
    // STEP 5: Growth Milestones (Track Evolution)
    // ========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.growth_milestones (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        
        milestone_type TEXT NOT NULL, -- stage_advancement, dimension_breakthrough, crisis_overcome
        
        previous_state JSONB,
        new_state JSONB,
        
        trigger_interaction_id BIGINT,
        description TEXT,
        
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Table: growth_milestones');
    
    // ========================================
    // STEP 6: Training Jobs (Enhanced)
    // ========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.training_jobs (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        
        job_id TEXT NOT NULL,
        job_name TEXT NOT NULL,
        adapter_version TEXT NOT NULL,
        
        status TEXT DEFAULT 'pending',
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        
        -- Dataset Composition
        dataset_composition JSONB DEFAULT '{}', -- { growth_memory: 10, challenge_memory: 5, etc. }
        total_samples INT DEFAULT 0,
        
        -- Ethical State Snapshot
        ethical_profile_snapshot JSONB DEFAULT '{}',
        growth_stage_at_training INT,
        
        -- Training Metrics
        training_loss FLOAT,
        final_metrics JSONB DEFAULT '{}',
        
        error_message TEXT,
        retry_count INT DEFAULT 0,
        
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Table: training_jobs');
    
    // ========================================
    // STEP 7: Gating Logs (Audit Trail)
    // ========================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.gating_logs (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        
        input_text TEXT NOT NULL,
        classification TEXT,
        
        ethical_scores JSONB,
        growth_stage INT,
        moments JSONB DEFAULT '[]',
        
        reflection_prompt TEXT,
        gentle_guidance TEXT,
        
        processing_time_ms INT,
        
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Table: gating_logs');
    
    // ========================================
    // STEP 8: Legacy Tables (Keep for Migration)
    // ========================================
    
    // Keep old tables if they exist (for data migration)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.stm_good (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        text TEXT NOT NULL,
        embedding vector(768),
        metadata JSONB DEFAULT '{}',
        valence TEXT DEFAULT 'positive',
        alignment_score FLOAT,
        approved_for_consolidation BOOLEAN DEFAULT FALSE,
        migrated_to_interaction_memory BOOLEAN DEFAULT FALSE
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.stm_bad (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        text TEXT NOT NULL,
        embedding vector(768),
        metadata JSONB DEFAULT '{}',
        valence TEXT DEFAULT 'negative',
        severity_score FLOAT,
        toxicity_score FLOAT,
        shadow_tag TEXT,
        safe_counterfactual TEXT,
        approved_for_shadow_learning BOOLEAN DEFAULT FALSE,
        migrated_to_interaction_memory BOOLEAN DEFAULT FALSE
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.stm_review (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        text TEXT NOT NULL,
        embedding vector(768),
        metadata JSONB DEFAULT '{}',
        gating_reason TEXT,
        human_reviewed BOOLEAN DEFAULT FALSE,
        migrated_to_interaction_memory BOOLEAN DEFAULT FALSE
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.mcl_chains (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        event_chain JSONB NOT NULL,
        intention_score FLOAT,
        necessity_score FLOAT,
        harm_score FLOAT,
        benefit_score FLOAT,
        moral_classification TEXT,
        summary TEXT,
        embedding vector(768),
        approved_for_training BOOLEAN DEFAULT FALSE,
        migrated_to_interaction_memory BOOLEAN DEFAULT FALSE
      )
    `);
    
    console.log('✅ Legacy tables preserved for migration');
    
    // ========================================
    // STEP 9: Indexes
    // ========================================
    
    const indexes = [
      // Ethical Profiles
      'CREATE INDEX IF NOT EXISTS idx_ethical_profiles_stage ON user_data_schema.ethical_profiles(growth_stage)',
      'CREATE INDEX IF NOT EXISTS idx_ethical_profiles_updated ON user_data_schema.ethical_profiles(updated_at DESC)',
      
      // Interaction Memories
      'CREATE INDEX IF NOT EXISTS idx_interaction_user ON user_data_schema.interaction_memories(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_interaction_classification ON user_data_schema.interaction_memories(classification)',
      'CREATE INDEX IF NOT EXISTS idx_interaction_approved ON user_data_schema.interaction_memories(approved_for_training)',
      'CREATE INDEX IF NOT EXISTS idx_interaction_created ON user_data_schema.interaction_memories(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_interaction_embedding ON user_data_schema.interaction_memories USING hnsw (embedding vector_cosine_ops)',
      
      // Memory Embeddings
      'CREATE INDEX IF NOT EXISTS idx_memory_embeddings_user ON user_data_schema.memory_embeddings(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_memory_embeddings_vector ON user_data_schema.memory_embeddings USING hnsw (embedding vector_cosine_ops)',
      'CREATE INDEX IF NOT EXISTS idx_memory_embeddings_interaction ON user_data_schema.memory_embeddings(interaction_memory_id)',
      
      // Growth Milestones
      'CREATE INDEX IF NOT EXISTS idx_milestones_user ON user_data_schema.growth_milestones(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_milestones_type ON user_data_schema.growth_milestones(milestone_type)',
      'CREATE INDEX IF NOT EXISTS idx_milestones_created ON user_data_schema.growth_milestones(created_at DESC)',
      
      // Training Jobs
      'CREATE INDEX IF NOT EXISTS idx_training_jobs_user ON user_data_schema.training_jobs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_training_jobs_status ON user_data_schema.training_jobs(status)',
      'CREATE INDEX IF NOT EXISTS idx_training_jobs_created ON user_data_schema.training_jobs(created_at DESC)',
      
      // Gating Logs
      'CREATE INDEX IF NOT EXISTS idx_gating_logs_user ON user_data_schema.gating_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_gating_logs_classification ON user_data_schema.gating_logs(classification)',
      'CREATE INDEX IF NOT EXISTS idx_gating_logs_created ON user_data_schema.gating_logs(created_at DESC)',
      
      // Legacy tables
      'CREATE INDEX IF NOT EXISTS idx_stm_good_user ON user_data_schema.stm_good(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_stm_good_migrated ON user_data_schema.stm_good(migrated_to_interaction_memory)',
      'CREATE INDEX IF NOT EXISTS idx_stm_bad_user ON user_data_schema.stm_bad(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_stm_bad_migrated ON user_data_schema.stm_bad(migrated_to_interaction_memory)',
      'CREATE INDEX IF NOT EXISTS idx_stm_review_user ON user_data_schema.stm_review(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_stm_review_migrated ON user_data_schema.stm_review(migrated_to_interaction_memory)',
      'CREATE INDEX IF NOT EXISTS idx_mcl_user ON user_data_schema.mcl_chains(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_mcl_migrated ON user_data_schema.mcl_chains(migrated_to_interaction_memory)',
    ];
    
    for (const indexSql of indexes) {
      await client.query(indexSql);
    }
    console.log('✅ All indexes created');
    
    // ========================================
    // STEP 10: Triggers
    // ========================================
    
    await client.query(`
      CREATE OR REPLACE FUNCTION user_data_schema.update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    
    const triggers = [
      'ethical_profiles',
      'interaction_memories',
      'memory_embeddings',
      'training_jobs',
    ];
    
    for (const table of triggers) {
      await client.query(`
        DROP TRIGGER IF EXISTS update_${table}_updated_at ON user_data_schema.${table};
        CREATE TRIGGER update_${table}_updated_at
          BEFORE UPDATE ON user_data_schema.${table}
          FOR EACH ROW
          EXECUTE FUNCTION user_data_schema.update_updated_at()
      `);
    }
    console.log('✅ Triggers created');
    
    // ========================================
    // STEP 11: Views
    // ========================================
    
    // View: Training-ready data
    await client.query(`
      CREATE OR REPLACE VIEW user_data_schema.v_training_ready AS
      SELECT 
        user_id,
        classification,
        COUNT(*) as count,
        AVG((ethical_scores->>'self_awareness')::float) as avg_self_awareness,
        AVG((ethical_scores->>'compassion')::float) as avg_compassion,
        AVG(training_weight) as avg_weight
      FROM user_data_schema.interaction_memories
      WHERE approved_for_training = TRUE
      GROUP BY user_id, classification
    `);
    
    // View: Growth summary
    await client.query(`
      CREATE OR REPLACE VIEW user_data_schema.v_growth_summary AS
      SELECT 
        ep.user_id,
        ep.growth_stage,
        ep.total_interactions,
        ep.breakthrough_moments,
        ep.crisis_interventions,
        COUNT(DISTINCT im.classification) as unique_classifications,
        COUNT(im.id) as total_memories,
        COUNT(CASE WHEN im.approved_for_training THEN 1 END) as approved_memories
      FROM user_data_schema.ethical_profiles ep
      LEFT JOIN user_data_schema.interaction_memories im ON ep.user_id = im.user_id
      GROUP BY ep.user_id, ep.growth_stage, ep.total_interactions, ep.breakthrough_moments, ep.crisis_interventions
    `);
    
    console.log('✅ Views created');
    
    // ========================================
    // STEP 12: Permissions
    // ========================================
    
    if (adminConnectionString && adminConnectionString !== connectionString) {
      const regularConfig = parsePostgresUrl(connectionString);
      
      if (regularConfig?.user) {
        console.log(`📝 Granting permissions to: ${regularConfig.user}`);
        
        await client.query(`GRANT USAGE ON SCHEMA user_data_schema TO ${regularConfig.user}`);
        await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA user_data_schema TO ${regularConfig.user}`);
        await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA user_data_schema TO ${regularConfig.user}`);
        await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA user_data_schema GRANT ALL ON TABLES TO ${regularConfig.user}`);
        await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA user_data_schema GRANT ALL ON SEQUENCES TO ${regularConfig.user}`);
        
        console.log('✅ Permissions granted');
      }
    }
    
    console.log('🎉 Ethical Growth Schema initialization completed!');
    return true;
    
  } catch (error) {
    console.error('❌ Schema initialization error:', error);
    return false;
  } finally {
    await client.end();
  }
}

/**
 * Migrate existing data from legacy tables to new structure
 */
export async function migrateLegacyData(connectionString: string): Promise<{
  success: boolean;
  migrated: { good: number; bad: number; review: number; mcl: number };
  errors: string[];
}> {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('🔄 Starting data migration...');
    
    const errors: string[] = [];
    const migrated = { good: 0, bad: 0, review: 0, mcl: 0 };
    
    // Migrate stm_good → growth_memory
    try {
      const goodResult = await client.query(`
        INSERT INTO user_data_schema.interaction_memories 
          (user_id, text, embedding, classification, ethical_scores, approved_for_training, training_weight, metadata, created_at)
        SELECT 
          user_id,
          text,
          embedding,
          'growth_memory' as classification,
          jsonb_build_object(
            'self_awareness', COALESCE(alignment_score, 0.5),
            'emotional_regulation', 0.5,
            'compassion', 0.5,
            'integrity', 0.5,
            'growth_mindset', 0.5,
            'wisdom', 0.5,
            'transcendence', 0.3
          ) as ethical_scores,
          approved_for_consolidation as approved_for_training,
          1.5 as training_weight,
          metadata,
          created_at
        FROM user_data_schema.stm_good
        WHERE migrated_to_interaction_memory = FALSE
        RETURNING id
      `);
      
      migrated.good = goodResult.rowCount || 0;
      
      await client.query(`
        UPDATE user_data_schema.stm_good
        SET migrated_to_interaction_memory = TRUE
        WHERE migrated_to_interaction_memory = FALSE
      `);
      
      console.log(`✅ Migrated ${migrated.good} good channel records`);
    } catch (error) {
      errors.push(`Good channel migration: ${(error as Error).message}`);
    }
    
    // Migrate stm_bad → challenge_memory
    try {
      const badResult = await client.query(`
        INSERT INTO user_data_schema.interaction_memories 
          (user_id, text, embedding, classification, ethical_scores, gentle_guidance, approved_for_training, training_weight, metadata, created_at)
        SELECT 
          user_id,
          text,
          embedding,
          'challenge_memory' as classification,
          jsonb_build_object(
            'self_awareness', GREATEST(0.3, 1.0 - COALESCE(severity_score, 0.5)),
            'emotional_regulation', GREATEST(0.2, 1.0 - COALESCE(toxicity_score, 0.5)),
            'compassion', 0.4,
            'integrity', 0.4,
            'growth_mindset', 0.5,
            'wisdom', 0.4,
            'transcendence', 0.2
          ) as ethical_scores,
          safe_counterfactual as gentle_guidance,
          approved_for_shadow_learning as approved_for_training,
          2.0 as training_weight,
          jsonb_build_object('shadow_tag', shadow_tag, 'original_metadata', metadata) as metadata,
          created_at
        FROM user_data_schema.stm_bad
        WHERE migrated_to_interaction_memory = FALSE
        RETURNING id
      `);
      
      migrated.bad = badResult.rowCount || 0;
      
      await client.query(`
        UPDATE user_data_schema.stm_bad
        SET migrated_to_interaction_memory = TRUE
        WHERE migrated_to_interaction_memory = FALSE
      `);
      
      console.log(`✅ Migrated ${migrated.bad} bad channel records`);
    } catch (error) {
      errors.push(`Bad channel migration: ${(error as Error).message}`);
    }
    
    // Migrate stm_review → neutral_interaction
    try {
      const reviewResult = await client.query(`
        INSERT INTO user_data_schema.interaction_memories 
          (user_id, text, embedding, classification, ethical_scores, approved_for_training, training_weight, metadata, created_at)
        SELECT 
          user_id,
          text,
          embedding,
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
          jsonb_build_object('gating_reason', gating_reason, 'original_metadata', metadata) as metadata,
          created_at
        FROM user_data_schema.stm_review
        WHERE migrated_to_interaction_memory = FALSE
        RETURNING id
      `);
      
      migrated.review = reviewResult.rowCount || 0;
      
      await client.query(`
        UPDATE user_data_schema.stm_review
        SET migrated_to_interaction_memory = TRUE
        WHERE migrated_to_interaction_memory = FALSE
      `);
      
      console.log(`✅ Migrated ${migrated.review} review queue records`);
    } catch (error) {
      errors.push(`Review queue migration: ${(error as Error).message}`);
    }
    
    // Migrate mcl_chains → wisdom_moment
    try {
      const mclResult = await client.query(`
        INSERT INTO user_data_schema.interaction_memories 
          (user_id, text, embedding, classification, ethical_scores, approved_for_training, training_weight, metadata, created_at)
        SELECT 
          user_id,
          summary as text,
          embedding,
          'wisdom_moment' as classification,
          jsonb_build_object(
            'self_awareness', COALESCE(intention_score, 0.5),
            'emotional_regulation', 0.6,
            'compassion', COALESCE(benefit_score, 0.5),
            'integrity', 0.6,
            'growth_mindset', 0.7,
            'wisdom', GREATEST(0.6, COALESCE(necessity_score, 0.5)),
            'transcendence', 0.5
          ) as ethical_scores,
          approved_for_training,
          2.5 as training_weight,
          jsonb_build_object(
            'event_chain', event_chain,
            'moral_classification', moral_classification,
            'harm_score', harm_score,
            'benefit_score', benefit_score
          ) as metadata,
          created_at
        FROM user_data_schema.mcl_chains
        WHERE migrated_to_interaction_memory = FALSE
        RETURNING id
      `);
      
      migrated.mcl = mclResult.rowCount || 0;
      
      await client.query(`
        UPDATE user_data_schema.mcl_chains
        SET migrated_to_interaction_memory = TRUE
        WHERE migrated_to_interaction_memory = FALSE
      `);
      
      console.log(`✅ Migrated ${migrated.mcl} MCL chain records`);
    } catch (error) {
      errors.push(`MCL migration: ${(error as Error).message}`);
    }
    
    // Create initial ethical profiles for existing users
    try {
      await client.query(`
        INSERT INTO user_data_schema.ethical_profiles (user_id, total_interactions, created_at)
        SELECT 
          user_id,
          COUNT(*) as total_interactions,
          MIN(created_at) as created_at
        FROM user_data_schema.interaction_memories
        GROUP BY user_id
        ON CONFLICT (user_id) DO UPDATE SET
          total_interactions = EXCLUDED.total_interactions
      `);
      
      console.log('✅ Initial ethical profiles created');
    } catch (error) {
      errors.push(`Ethical profiles: ${(error as Error).message}`);
    }
    
    const totalMigrated = migrated.good + migrated.bad + migrated.review + migrated.mcl;
    console.log(`🎉 Migration completed: ${totalMigrated} total records`);
    
    return {
      success: errors.length === 0,
      migrated,
      errors,
    };
    
  } catch (error) {
    console.error('❌ Migration error:', error);
    return {
      success: false,
      migrated: { good: 0, bad: 0, review: 0, mcl: 0 },
      errors: [(error as Error).message],
    };
  } finally {
    await client.end();
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