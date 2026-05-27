const express = require('express');
const router  = express.Router();
const db      = require('../db');

router.get('/whatsapp', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('[Webhook] Verified successfully ✅');
    return res.status(200).send(challenge);
  }
  console.warn('[Webhook] Verification failed');
  return res.sendStatus(403);
});

router.post('/whatsapp', async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value    = change.value || {};
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        for (const msg of messages) {
          if (msg.type !== 'text') continue;

          const from        = msg.from;
          const msgText     = msg.text?.body || '';
          const whatsappMid = msg.id;
          const senderName  = contacts.find(c => c.wa_id === from)?.profile?.name || from;

          console.log(`[Webhook] Message from ${from}: "${msgText}"`);

          const upsertContact = await db.query(
            `INSERT INTO contacts (hubspot_contact_id, whatsapp_number, display_name)
             VALUES ($1, $2, $3)
             ON CONFLICT (hubspot_contact_id)
               DO UPDATE SET display_name = EXCLUDED.display_name,
                             updated_at   = NOW()
             RETURNING id`,
            [`wa_${from}`, from, senderName]
          );
          const contactId = upsertContact.rows[0].id;

          let convResult = await db.query(
            `SELECT id FROM conversations WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [contactId]
          );
          let conversationId;
          if (convResult.rows.length === 0) {
            const newConv = await db.query(
              `INSERT INTO conversations (contact_id) VALUES ($1) RETURNING id`,
              [contactId]
            );
            conversationId = newConv.rows[0].id;
          } else {
            conversationId = convResult.rows[0].id;
          }

          await db.query(
            `INSERT INTO messages
               (conversation_id, direction, message_text, whatsapp_message_id, status, is_read)
             VALUES ($1, 'incoming', $2, $3, 'received', FALSE)
             ON CONFLICT (whatsapp_message_id) DO NOTHING`,
            [conversationId, msgText, whatsappMid]
          );

          await db.query(
            `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
            [conversationId]
          );
        }
      }
    }
  } catch (err) {
    console.error('[Webhook] Error:', err.message);
  }
});

module.exports = router;