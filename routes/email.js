require('dotenv').config();
const express = require('express');
const router = express.Router();
const sgMail = require('@sendgrid/mail');

// Set SendGrid API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

router.post('/submit-form', async (req, res) => {
  const { subject, text, html } = req.body;

  if (!subject || (!text && !html)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const msg = {
      to: process.env.SENDGRID_TO_EMAIL,       // Where the email should go
      from: process.env.SENDGRID_FROM_EMAIL,   // Must be a verified sender in SendGrid
      subject,
      text,
      html,
    };

    const info = await sgMail.send(msg);

    // SendGrid returns an array of responses, pick the first
    res.json({ success: true, messageId: info[0].headers['x-message-id'] });
  } catch (error) {
    console.error(error.response ? error.response.body : error.message);
    res.status(500).json({ error: error.response ? error.response.body : error.message });
  }
});

module.exports = router;