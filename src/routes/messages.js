const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const db      = require('../db');

const WA_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v18.0';
const WA_PHONE_ID    = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WA_TOKEN       = process.env.WHATSAPP_TOKEN;

router.post('/send', async (req, res) => {
  const { hubspotContactId, messageText } = req.body;

  if (!hubspotContactId || !messageText?.trim()) {
    return res.status(400).json({ error: 'hubspotContactId and messageText are required' });
  }

  try {
    const contactResult = await db.query(
      `SELECT id, whatsapp_number FROM contacts WHERE hubspot_contact_id = $1`,
      [hubspotContactId]
    );
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found.' });
    }

    const contact = contactResult.rows[0];

    let convResult = await db.query(
      `SELECT id FROM conversations WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [contact.id]
    );
    let conversationId;
    if (convResult.rows.length === 0) {
      const newConv = await db.query(
        `INSERT INTO conversations (contact_id) VALUES ($1) RETURNING id`,
        [contact.id]
      );
      conversationId = newConv.rows[0].id;
    } else {
      conversationId = convResult.rows[0].id;
    }

    const url = `https://graph.facebook.com/${WA_API_VERSION}/${WA_PHONE_ID}/messages`;
    let whatsappMid = null;
    let sendStatus  = 'sent';

    try {
      const waResponse = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          recipient_type:    'individual',
          to:                contact.whatsapp_number,
          type:              'text',
          text:              { preview_url: false, body: messageText.trim() },
        },
        {
          headers: {
            Authorization: `Bearer ${WA_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );
      whatsappMid = waResponse.data?.messages?.[0]?.id || null;
    } catch (waErr) {
      console.error('[Messages] WhatsApp API error:', waErr.response?.data || waErr.message);
      sendStatus = 'failed';
    }

    const insertResult = await db.query(
      `INSERT INTO messages
         (conversation_id, direction, message_text, whatsapp_message_id, status, is_read)
       VALUES ($1, 'outgoing', $2, $3, $4, TRUE)
       RETURNING *`,
      [conversationId, messageText.trim(), whatsappMid, sendStatus]
    );

    await db.query(
      `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    return res.json({ success: true, message: insertResult.rows[0] });
  } catch (err) {
    console.error('[Messages] Send error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/mark-read', async (req, res) => {
  const { hubspotContactId, conversationId } = req.body;

  try {
    let convId = conversationId;

    if (!convId && hubspotContactId) {
      const r = await db.query(
        `SELECT conv.id
         FROM conversations conv
         JOIN contacts c ON c.id = conv.contact_id
         WHERE c.hubspot_contact_id = $1
         ORDER BY conv.created_at DESC LIMIT 1`,
        [hubspotContactId]
      );
      convId = r.rows[0]?.id;
    }

    if (!convId) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const result = await db.query(
      `UPDATE messages
       SET is_read = TRUE
       WHERE conversation_id = $1
         AND direction = 'incoming'
         AND is_read = FALSE
       RETURNING id`,
      [convId]
    );

    return res.json({ success: true, markedCount: result.rowCount });
  } catch (err) {
    console.error('[Messages] mark-read error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;