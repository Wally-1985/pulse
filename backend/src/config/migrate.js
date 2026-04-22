require('dotenv').config();
const { pool } = require('./database');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Enable UUID extension
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // ─── TEAMS ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        parent_id UUID REFERENCES teams(id) ON DELETE SET NULL,
        week_start VARCHAR(10) DEFAULT 'monday',
        missing_threshold INTEGER DEFAULT 50,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `);

    // ─── USERS ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        avatar_url VARCHAR(500),
        timezone VARCHAR(100) DEFAULT 'UTC',
        is_active BOOLEAN DEFAULT true,
        auth_method VARCHAR(20) DEFAULT 'password',
        mfa_enabled BOOLEAN DEFAULT false,
        mfa_secret VARCHAR(255),
        mfa_type VARCHAR(20) DEFAULT 'totp',
        mfa_enforced BOOLEAN DEFAULT false,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMPTZ,
        password_reset_token VARCHAR(255),
        password_reset_expires TIMESTAMPTZ,
        setup_status VARCHAR(20) DEFAULT 'active',
        notification_preference VARCHAR(20) DEFAULT 'both',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `);

    // ─── ROLES ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      INSERT INTO roles (name, description) VALUES
        ('admin', 'System administrator'),
        ('manager', 'Team manager'),
        ('member', 'Team member')
      ON CONFLICT (name) DO NOTHING
    `);

    // ─── USER ROLES ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, role_id)
      )
    `);

    // ─── USER TEAMS ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_teams (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, team_id)
      )
    `);

    // ─── MANAGER TEAM ASSIGNMENTS ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS manager_teams (
        manager_id UUID REFERENCES users(id) ON DELETE CASCADE,
        team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
        include_child_teams BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (manager_id, team_id)
      )
    `);

    // ─── MANAGER USER SETTINGS ─────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS manager_user_settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        manager_id UUID REFERENCES users(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        working_day_hours NUMERIC(4,2) DEFAULT 9,
        alerts_enabled BOOLEAN DEFAULT true,
        missed_day_threshold INTEGER DEFAULT 1,
        leave_start DATE,
        leave_end DATE,
        leave_note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(manager_id, user_id)
      )
    `);

    // ─── DAILY ENTRIES ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_entries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        entry_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'draft',
        working_day_minutes INTEGER DEFAULT 540,
        submitted_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ,
        deleted_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, entry_date)
      )
    `);

    // ─── WORK ITEMS ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS work_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        entry_id UUID REFERENCES daily_entries(id) ON DELETE CASCADE,
        detail TEXT NOT NULL DEFAULT '',
        work_type VARCHAR(50) NOT NULL DEFAULT 'project',
        time_minutes INTEGER NOT NULL DEFAULT 0,
        is_locked BOOLEAN DEFAULT false,
        sort_order INTEGER DEFAULT 0,
        colour VARCHAR(20),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `);

    // ─── SESSIONS ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        device_info TEXT,
        ip_address VARCHAR(45),
        remember_me BOOLEAN DEFAULT false,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_used_at TIMESTAMPTZ DEFAULT NOW(),
        revoked_at TIMESTAMPTZ
      )
    `);

    // ─── AUDIT LOG ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        api_key_id UUID,
        role VARCHAR(50),
        action_type VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100),
        entity_id UUID,
        old_value JSONB,
        new_value JSONB,
        success BOOLEAN DEFAULT true,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ─── NOTIFICATIONS ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT,
        is_read BOOLEAN DEFAULT false,
        related_entity_type VARCHAR(100),
        related_entity_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        read_at TIMESTAMPTZ
      )
    `);

    // ─── PUBLIC HOLIDAYS ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS public_holidays (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        date DATE NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ─── NON WORKING DATES ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS non_working_dates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        date DATE NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ─── SYSTEM SETTINGS ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      INSERT INTO system_settings (key, value) VALUES
        ('auth_method', 'password'),
        ('mfa_policy', 'optional'),
        ('smtp_host', ''),
        ('smtp_port', '587'),
        ('smtp_user', ''),
        ('smtp_from', ''),
        ('app_name', 'Pulse'),
        ('default_working_hours', '9'),
        ('data_retention_years', '0'),
        ('sso_provider', ''),
        ('sso_client_id', ''),
        ('sso_discovery_url', ''),
        ('sso_redirect_uri', '')
      ON CONFLICT (key) DO NOTHING
    `);

    // ─── API KEYS ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        key_hash VARCHAR(255) NOT NULL UNIQUE,
        key_prefix VARCHAR(20) NOT NULL,
        permissions JSONB DEFAULT '{"read": true, "write": false}'::jsonb,
        ip_restrictions TEXT[],
        created_by UUID REFERENCES users(id),
        last_used_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ─── INDEXES ───────────────────────────────────────────────────────────
    // Zendesk user settings
    await client.query(`CREATE TABLE IF NOT EXISTS user_zendesk_settings (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      subdomain VARCHAR(255),
      email VARCHAR(255),
      api_token VARCHAR(500),
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // Ongoing tasks
    await client.query(`CREATE TABLE IF NOT EXISTS ongoing_tasks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      detail TEXT NOT NULL,
      work_type VARCHAR(50) DEFAULT 'other',
      created_date DATE NOT NULL DEFAULT CURRENT_DATE,
      source_entry_id UUID REFERENCES daily_entries(id) ON DELETE SET NULL,
      completed BOOLEAN DEFAULT false,
      dismissed BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // State-based holidays (Section 4.5)
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS state VARCHAR(3) NULL`);
    await client.query(`ALTER TABLE public_holidays ADD COLUMN IF NOT EXISTS state VARCHAR(3) NULL`);

    // Staff roster (Task 3 + V2 addition, Section 4.4)
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS roster_start_time TIME DEFAULT NULL`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS roster_finish_time TIME DEFAULT NULL`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS roster_working_days VARCHAR(7) DEFAULT 'MTWTF__'`);

    // Yeastar extension number on user profile
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS extension_number VARCHAR(20) DEFAULT NULL`);

    // Task 8 - Azure OpenAI / AI infrastructure
    await client.query(`CREATE TABLE IF NOT EXISTS ai_prompt_templates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      template_text TEXT NOT NULL,
      use_case VARCHAR(50) NOT NULL,
      enabled BOOLEAN DEFAULT true,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(name, version)
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS ai_summary_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      use_case VARCHAR(50) NOT NULL,
      prompt_template_id UUID REFERENCES ai_prompt_templates(id) ON DELETE SET NULL,
      prompt_template_version INTEGER,
      summary_text TEXT NOT NULL,
      generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      generated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS ai_jobs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_type VARCHAR(50) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
      input_json JSONB,
      result_json JSONB,
      error_message TEXT,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_summary_user ON ai_summary_history(user_id, period_start)`);
    await client.query(`COMMENT ON COLUMN public_holidays.state IS 'NULL = applies to all states. QLD/NSW/VIC/SA/WA/TAS/NT/ACT = state-specific'`);

    // Entry drafts (Section 4.2 - Draft/Auto-save)
    await client.query(`CREATE TABLE IF NOT EXISTS entry_drafts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_date DATE NOT NULL,
      draft_json JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, entry_date)
    )`);

    // Add zendesk_settings to existing tables if not present
    await client.query(`ALTER TABLE user_zendesk_settings ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true`);

    // Add working_day_minutes to existing tables if not present
    await client.query(`ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS working_day_minutes INTEGER DEFAULT 540`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_daily_entries_user_date ON daily_entries(user_id, entry_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_daily_entries_date ON daily_entries(entry_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_work_items_entry ON work_items(entry_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)`);

    // ─── PROJECT MANAGEMENT (Tasks 12-14) ───────────────────────────────────
    await client.query(`CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'not_started',
      priority INTEGER CHECK (priority BETWEEN 1 AND 4),
      last_activity_at TIMESTAMPTZ,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS project_user_assignments (
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
      PRIMARY KEY (project_id, user_id)
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS project_tasks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'not_started',
      due_date DATE,
      sort_order INTEGER DEFAULT 0,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS project_notes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      note_text TEXT NOT NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await client.query(`ALTER TABLE work_items ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status) WHERE deleted_at IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id) WHERE deleted_at IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_project_notes_project ON project_notes(project_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_work_items_project ON work_items(project_id) WHERE project_id IS NOT NULL`);

    await client.query('COMMIT');
    console.log('✅ Migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

migrate().catch(() => process.exit(1));
