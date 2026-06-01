require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'waitlist.db');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Initialize Database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    db.serialize(() => {
      // Main waitlist table
      db.run(`
        CREATE TABLE IF NOT EXISTS waitlist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          timestamp TEXT NOT NULL
        )
      `, (err) => {
        if (err) console.error('Error creating waitlist table:', err.message);
        else {
          console.log('[ok] waitlist table ready');
          // Add column migration safely without data loss
          db.run(`ALTER TABLE waitlist ADD COLUMN sender_email TEXT DEFAULT 'mintvybe@gmail.com'`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column name')) {
              console.error('Migration error on waitlist:', alterErr.message);
            }
          });
        }
      });

      // Pending verifications table for email validation flow
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
          console.log('[ok] pending_verifications table ready');
          // Add column migration safely
          db.run(`ALTER TABLE pending_verifications ADD COLUMN sender_email TEXT DEFAULT 'mintvybe@gmail.com'`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column name')) {
              console.error('Migration error on pending_verifications:', alterErr.message);
            }
          });
        }
      });
    });
  }
});

// Configure Nodemailer SMTP Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT == 465,
  auth: {
    user: process.env.SMTP_USER || 'mintvybe@gmail.com',
    pass: process.env.SMTP_PASS || ''
  }
});

// Helper: Generate 6-digit alphanumeric code (mix of capital alphabets and numbers)
function generateVerificationCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Humanize: readable date formatting
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

// Attractive Monochrome email template
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

// Serve landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve separate VybeMint redesign page
app.get('/vybemint', (req, res) => {
  res.sendFile(path.join(__dirname, 'vybemint.html'));
});

// Duplicate check endpoint
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

// Step 1: Request verification email
app.post('/api/request-verification', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'invalid email' });
  }

  // Double check duplicates first
  db.get('SELECT id FROM waitlist WHERE LOWER(email) = ?', [email], (err, row) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: 'database error' });
    }
    if (row) {
      return res.status(409).json({ error: 'already_registered' });
    }

    // Generate code and expiration (5 mins)
    const code = generateVerificationCode();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const senderEmail = process.env.SMTP_USER || 'mintvybe@gmail.com';

    db.serialize(() => {
      // Clear any prior pending code for this email
      db.run('DELETE FROM pending_verifications WHERE LOWER(email) = ?', [email]);

      // Save code along with sender_email
      db.run(
        'INSERT INTO pending_verifications (email, code, sender_email, expires_at) VALUES (?, ?, ?, ?)',
        [email, code, senderEmail, expiresAt],
        async function (insertErr) {
          if (insertErr) {
            console.error(insertErr.message);
            return res.status(500).json({ error: 'database error' });
          }

          // Output code to backend console for easy local testing
          console.log(`[Verification Code for ${email}]: ${code}`);

          // Send SMTP email
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

// Step 2: Verify code and register email to waitlist
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

    // Expiry check
    if (Date.now() > row.expires_at) {
      db.run('DELETE FROM pending_verifications WHERE LOWER(email) = ?', [email]);
      return res.status(400).json({ error: 'Verification code expired. Please request a new one.' });
    }

    // Attempt count check (brute force mitigation)
    if (row.attempts >= 5) {
      db.run('DELETE FROM pending_verifications WHERE LOWER(email) = ?', [email]);
      return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new code.' });
    }

    // Verify code
    if (row.code !== code) {
      const newAttempts = row.attempts + 1;
      db.run('UPDATE pending_verifications SET attempts = ? WHERE LOWER(email) = ?', [newAttempts, email]);
      return res.status(400).json({ 
        error: 'Incorrect verification code.', 
        attemptsRemaining: 5 - newAttempts 
      });
    }

    // If correct, register user in waitlist table using correct sender_email
    const timestamp = getFormattedTimestamp();
    const senderEmail = row.sender_email || 'mintvybe@gmail.com';

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

          // Success: delete pending verification record
          db.run('DELETE FROM pending_verifications WHERE LOWER(email) = ?', [email]);
          res.status(201).json({ created: 1 });
        }
      );
    });
  });
});

// Hidden, protected route to retrieve waitlist signups
app.get('/api/export-hidden', (req, res) => {
  const secret = req.query.secret;
  const SECRET_KEY = process.env.EXPORT_SECRET || 'vybemint-secret-key-2026';

  if (!secret || secret !== SECRET_KEY) {
    return res.status(403).json({ error: 'unauthorized access' });
  }

  db.all('SELECT id, email, sender_email, timestamp FROM waitlist ORDER BY id DESC', [], (err, rows) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: 'database error' });
    }
    
    // Support JSON or plain CSV representation
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ok] Server running -> http://localhost:${PORT}`);
});
