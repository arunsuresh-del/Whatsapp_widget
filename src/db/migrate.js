require('dotenv').config();
const { pool } = require('./index');

async function migrate() {
  console.log('Creating database tables...');
  
  const sql = `
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS contacts (
      id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      hubspot_contact_id VARCHAR(64) NOT NULL UNIQUE,
      whatsapp_number    VARCHAR(32) NOT NULL,
      display_name       VARCHAR(255),
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      direction           VARCHAR(8) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
      message_text        TEXT NOT NULL,
      whatsapp_message_id VARCHAR(128) UNIQUE,
      status              VARCHAR(32) NOT NULL DEFAULT 'sent',
      is_read             BOOLEAN NOT NULL DEFAULT FALSE,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('✅ Tables created successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();