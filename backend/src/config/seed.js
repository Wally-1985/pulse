require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('./database');

const seed = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create default admin user
    const adminPassword = await bcrypt.hash('Admin123!', 12);
    const adminId = uuidv4();

    await client.query(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, setup_status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO NOTHING
    `, [adminId, 'admin@pulse.local', adminPassword, 'Admin', 'User', 'active']);

    // Assign admin role
    const adminRole = await client.query(`SELECT id FROM roles WHERE name = 'admin'`);
    if (adminRole.rows.length) {
      await client.query(`
        INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [adminId, adminRole.rows[0].id]);
    }

    // Create a sample team
    const teamId = uuidv4();
    await client.query(`
      INSERT INTO teams (id, name) VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [teamId, 'General']);

    await client.query('COMMIT');
    console.log('✅ Seed complete');
    console.log('📧 Admin login: admin@pulse.local');
    console.log('🔑 Admin password: Admin123!');
    console.log('⚠️  Change this password immediately after first login!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

seed().catch(() => process.exit(1));
