const express = require('express');
const router  = express.Router();
const db      = require('../db');

router.get('/:contactId', async (req, res) => {
  const { contactId } = req.params;
  const limit  = Math.min(parseInt(req.query.limit  || '50',  10), 200);
  const offset = Math.max(parseInt(req.query.offset || '0',   10), 0);

  try {
    const contactResult = await db.query(
      `SELECT id, hubspot_contact_id, whatsapp_number, display_name
       FROM contacts
       WHERE hubspot_contact_id = $1`,
      [contactId]
    );

    if (contactResult.rows.length === 0) {
      return res.json({ contact: null, conversation: null, messages: [], total: 0 });
    }

    const contact = contactResult.rows[0];

    const convResult = await db.query(
      `SELECT id, created_at, updated_at
       FROM conversations
       WHERE contact_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [contact.id]
    );

    if (convResult.rows.length === 0) {
      return res.json({ contact, conversation: null, messages: [], total: 0 });
    }

    const conversation = convResult.rows[0];

    const msgResult = await db.query(
      `SELECT id, direction, message_text, whatsapp_message_id, status, is_read, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [conversation.id, limit, offset]
    );

    const countResult = await db.query(
      `SELECT COUNT(*) AS total FROM messages WHERE conversation_id = $1`,
      [conversation.id]
    );

    return res.json({
      contact,
      conversation,
      messages: msgResult.rows,
      total: parseInt(countResult.rows[0].total, 10),
    });
  } catch (err) {
    console.error('[Conversations] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/upsert-contact', async (req, res) => {
  const { hubspotContactId, whatsappNumber, displayName } = req.body;

  if (!hubspotContactId || !whatsappNumber) {
    return res.status(400).json({ error: 'hubspotContactId and whatsappNumber are required' });
  }

  const normalised = whatsappNumber.replace(/\D/g, '');

  try {
    const result = await db.query(
      `INSERT INTO contacts (hubspot_contact_id, whatsapp_number, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (hubspot_contact_id)
         DO UPDATE SET whatsapp_number = EXCLUDED.whatsapp_number,
                       display_name    = EXCLUDED.display_name,
                       updated_at      = NOW()
       RETURNING *`,
      [hubspotContactId, normalised, displayName || null]
    );

    const contact = result.rows[0];
    const existing = await db.query(
      `SELECT id FROM conversations WHERE contact_id = $1 LIMIT 1`,
      [contact.id]
    );
    if (existing.rows.length === 0) {
      await db.query(
        `INSERT INTO conversations (contact_id) VALUES ($1)`,
        [contact.id]
      );
    }

    return res.json({ success: true, contact });
  } catch (err) {
    console.error('[Conversations] Upsert error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;