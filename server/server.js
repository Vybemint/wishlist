require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();

const CONFIG = {
  PORT: parseInt(process.env.PORT) || 3001,
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT) || 465,
  SMTP_SECURE: process.env.SMTP_SECURE ? (process.env.SMTP_SECURE === 'true') : true,
  SMTP_USER: process.env.SMTP_USER || 'mintvybe@gmail.com',
  SMTP_PASS: process.env.SMTP_PASS || '',
  EXPORT_SECRET: process.env.EXPORT_SECRET || 'vybemint-secret-key-2026',
  DEFAULT_SENDER_EMAIL: process.env.SMTP_USER || 'mintvybe@gmail.com',
  DB_PATH: process.env.DB_PATH || path.join(__dirname, 'waitlist.db')
};

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const db = new sqlite3.Database(CONFIG.DB_PATH, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS waitlist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          timestamp TEXT NOT NULL
        )
      `, (err) => {
        if (err) console.error('Error creating waitlist table:', err.message);
        else {
          db.run(`ALTER TABLE waitlist ADD COLUMN sender_email TEXT DEFAULT '${CONFIG.DEFAULT_SENDER_EMAIL}'`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column name')) {
              console.error('Migration error on waitlist:', alterErr.message);
            }
          });
        }
      });

      db.run(`
        CREATE TABLE IF NOT EXISTS pending_verifications (
          email TEXT NOT NULL UNIQUE,
          code TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          attempts INTEGER DEFAULT 0
        )
      `, (err) => {
        if (err) console.error('Error creating pending_verifications table:', err.message);
        else {
          db.run(`ALTER TABLE pending_verifications ADD COLUMN sender_email TEXT DEFAULT '${CONFIG.DEFAULT_SENDER_EMAIL}'`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column name')) {
              console.error('Migration error on pending_verifications:', alterErr.message);
            }
          });
        }
      });
    });
  }
});

const transporter = nodemailer.createTransport({
  host: CONFIG.SMTP_HOST,
  port: CONFIG.SMTP_PORT,
  secure: CONFIG.SMTP_SECURE,
  auth: {
    user: CONFIG.SMTP_USER,
    pass: CONFIG.SMTP_PASS
  }
});

function generateVerificationCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getFormattedTimestamp() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const year = now.getFullYear();
  
  const pad = (n) => String(n).padStart(2, '0');
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());

  return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
}

function getVerificationEmailHtml(code) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your Vybemint Email</title>
  <style>
    body {
      background-color: #050505;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      background-color: #050505;
      width: 100%;
      padding: 40px 0;
    }
    .container {
      max-width: 500px;
      margin: 0 auto;
      background-color: #0a0a0a;
      border: 1px solid #1a1a1a;
      border-radius: 16px;
      padding: 40px;
      text-align: center;
    }
    .logo {
      font-size: 24px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -1px;
      margin-bottom: 30px;
    }
    .logo span {
      color: #8b8b93;
    }
    h1 {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      line-height: 1.3;
      margin-top: 0;
      margin-bottom: 16px;
      letter-spacing: -0.5px;
    }
    p {
      color: #9b9b9f;
      font-size: 15px;
      line-height: 1.6;
      margin-top: 0;
      margin-bottom: 24px;
    }
    .code-container {
      background-color: #121212;
      border: 1px solid #222222;
      border-radius: 12px;
      padding: 16px 24px;
      display: inline-block;
      margin-bottom: 24px;
    }
    .code {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: 6px;
      color: #ffffff;
      font-family: 'Courier New', Courier, monospace;
      margin: 0;
      padding-left: 6px;
    }
    .footer {
      color: #4b4b4f;
      font-size: 12px;
      margin-top: 30px;
      line-height: 1.5;
    }
    .divider {
      height: 1px;
      background-color: #1a1a1a;
      margin: 30px 0;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="logo">vybe<span>mint</span></div>
      <h1>Verify your email address</h1>
      <p>Thank you for your interest in joining Vybemint. Please use the following 6-digit verification code to complete your waitlist registration:</p>
      <div class="code-container">
        <div class="code">${code}</div>
      </div>
      <p style="font-size: 13px; color: #6b6b6f; margin-bottom: 0;">This code is valid for 5 minutes. If you did not request this, please ignore this email.</p>
      <div class="divider"></div>
      <div class="footer">
        &copy; 2026 Vybemint. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>`;
}

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/check', (req, res) => {
  const email = (req.query.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'email required' });
  }

  db.get('SELECT id FROM waitlist WHERE LOWER(email) = ?', [email], (err, row) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: 'database error' });
    }
    res.json({ exists: !!row });
  });
});

app.post('/api/request-verification', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'invalid email' });
  }

  db.get('SELECT id FROM waitlist WHERE LOWER(email) = ?', [email], (err, row) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: 'database error' });
    }
    if (row) {
      return res.status(409).json({ error: 'already_registered' });
    }

    const code = generateVerificationCode();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const senderEmail = CONFIG.SMTP_USER;

    db.serialize(() => {
      db.run('DELETE FROM pending_verifications WHERE LOWER(email) = ?', [email]);

      db.run(
        'INSERT INTO pending_verifications (email, code, sender_email, expires_at) VALUES (?, ?, ?, ?)',
        [email, code, senderEmail, expiresAt],
        async function (insertErr) {
          if (insertErr) {
            console.error(insertErr.message);
            return res.status(500).json({ error: 'database error' });
          }

          if (process.env.DEBUG === 'true' || process.env.NODE_ENV !== 'production') {
            console.log(`[Verification Code for ${email}]: ${code}`);
          }

          const mailOptions = {
            from: `"Vybemint" <${senderEmail}>`,
            to: email,
            subject: `${code} is your Vybemint verification code`,
            html: getVerificationEmailHtml(code)
          };

          try {
            await transporter.sendMail(mailOptions);
            res.json({ success: true, message: 'Verification code sent! Please check your inbox.' });
          } catch (mailErr) {
            console.error('SMTP Mail send failed:', mailErr);
            res.status(500).json({ error: 'Failed to send verification email. Please check configuration.' });
          }
        }
      );
    });
  });
});

app.post('/api/verify-code', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const code = (req.body.code || '').trim().toUpperCase();

  if (!email || !code) {
    return res.status(400).json({ error: 'email and code required' });
  }

  db.get('SELECT * FROM pending_verifications WHERE LOWER(email) = ?', [email], (err, row) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: 'database error' });
    }

    if (!row) {
      return res.status(400).json({ error: 'No verification request found for this email.' });
    }

    if (Date.now() > row.expires_at) {
      db.run('DELETE FROM pending_verifications WHERE LOWER(email) = ?', [email]);
      return res.status(400).json({ error: 'Verification code expired. Please request a new one.' });
    }

    if (row.attempts >= 5) {
      db.run('DELETE FROM pending_verifications WHERE LOWER(email) = ?', [email]);
      return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new code.' });
    }

    if (row.code !== code) {
      const newAttempts = row.attempts + 1;
      db.run('UPDATE pending_verifications SET attempts = ? WHERE LOWER(email) = ?', [newAttempts, email]);
      return res.status(400).json({ 
        error: 'Incorrect verification code.', 
        attemptsRemaining: 5 - newAttempts 
      });
    }

    const timestamp = getFormattedTimestamp();
    const senderEmail = row.sender_email || CONFIG.DEFAULT_SENDER_EMAIL;

    db.serialize(() => {
      db.run(
        'INSERT INTO waitlist (email, sender_email, timestamp) VALUES (?, ?, ?)',
        [email, senderEmail, timestamp],
        function (waitlistErr) {
          if (waitlistErr) {
            if (waitlistErr.message.includes('UNIQUE constraint failed')) {
              db.run('DELETE FROM pending_verifications WHERE LOWER(email) = ?', [email]);
              return res.status(409).json({ error: 'already_registered' });
            }
            console.error(waitlistErr.message);
            return res.status(500).json({ error: 'database error' });
          }

          db.run('DELETE FROM pending_verifications WHERE LOWER(email) = ?', [email]);
          res.status(201).json({ created: 1 });
        }
      );
    });
  });
});

app.get('/api/export-hidden', (req, res) => {
  const secret = req.query.secret;
  const SECRET_KEY = CONFIG.EXPORT_SECRET;

  if (!secret || secret !== SECRET_KEY) {
    return res.status(403).json({ error: 'unauthorized access' });
  }

  db.all('SELECT id, email, sender_email, timestamp FROM waitlist ORDER BY id DESC', [], (err, rows) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: 'database error' });
    }
    
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=waitlist.csv');
      const csv = ['ID,Email,SenderEmail,Timestamp'].concat(
        rows.map(row => `${row.id},"${row.email}","${row.sender_email}",${row.timestamp}`)
      ).join('\n');
      return res.send(csv);
    }

    res.json(rows);
  });
});

app.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`[ok] Server running -> http://localhost:${CONFIG.PORT}`);
});