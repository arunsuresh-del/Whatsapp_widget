const express = require('express');
const router  = express.Router();
const db      = require('../db');

router.get('/:contactId', async (req, res) => {
  const { contactId } = req.params;

  try {
    const convResult = await db.query(
      `SELECT conv.id AS conversation_id
       FROM conversations conv
       JOIN contacts c ON c.id = conv.contact_id
       WHERE c.hubspot_contact_id = $1
       ORDER BY conv.created_at DESC
       LIMIT 1`,
      [contactId]
    );

    if (convResult.rows.length === 0) {
      return res.json({ unreadCount: 0, latestMessages: [] });
    }

    const conversationId = convResult.rows[0].conversation_id;

    const countResult = await db.query(
      `SELECT COUNT(*) AS unread
       FROM messages
       WHERE conversation_id = $1
         AND direction = 'incoming'
         AND is_read = FALSE`,
      [conversationId]
    );

    const latestResult = await db.query(
      `SELECT id, message_text, created_at, status
       FROM messages
       WHERE conversation_id = $1
         AND direction = 'incoming'
         AND is_read = FALSE
       ORDER BY created_at DESC
       LIMIT 5`,
      [conversationId]
    );

    return res.json({
      unreadCount:    parseInt(countResult.rows[0].unread, 10),
      latestMessages: latestResult.rows.reverse(),
      conversationId,
    });
  } catch (err) {
    console.error('[Notifications] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;