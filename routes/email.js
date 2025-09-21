require('dotenv').config();
const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

router.post('/submit-form', async (req, res) => {
  const { subject, text, html } = req.body;
  if (!subject || (!text && !html)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: process.env.GMAIL_USER,
      subject,
      text,
      html,
    };
    const info = await transporter.sendMail(mailOptions);
    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
