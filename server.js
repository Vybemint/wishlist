const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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
    db.run(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        timestamp TEXT NOT NULL
      )
    `, (err) => {
      if (err) console.error('Error creating table:', err.message);
      else console.log('[ok] waitlist.db ready');
    });
  }
});

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

// Serve landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
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

// Subscribe / Add email endpoint
app.post('/api/subscribe', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'invalid email' });
  }

  const timestamp = getFormattedTimestamp();

  db.run(
    'INSERT INTO waitlist (email, timestamp) VALUES (?, ?)',
    [email, timestamp],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: 'already_registered' });
        }
        console.error(err.message);
        return res.status(500).json({ error: 'database error' });
      }
      res.status(201).json({ created: 1 });
    }
  );
});

// Hidden, protected route to retrieve waitlist signups
// Access it via: http://localhost:3001/api/export-hidden?secret=vybemint-secret-key-2026
app.get('/api/export-hidden', (req, res) => {
  const secret = req.query.secret;
  const SECRET_KEY = process.env.EXPORT_SECRET || 'vybemint-secret-key-2026';

  if (!secret || secret !== SECRET_KEY) {
    return res.status(403).json({ error: 'unauthorized access' });
  }

  db.all('SELECT id, email, timestamp FROM waitlist ORDER BY id DESC', [], (err, rows) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: 'database error' });
    }
    
    // Support JSON or plain CSV representation
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=waitlist.csv');
      const csv = ['ID,Email,Timestamp'].concat(
        rows.map(row => `${row.id},"${row.email}",${row.timestamp}`)
      ).join('\n');
      return res.send(csv);
    }

    res.json(rows);
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ok] Server running -> http://localhost:${PORT}`);
});
