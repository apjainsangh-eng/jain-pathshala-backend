// server-login.js
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());

const DB = {
  host: 'localhost',
  user: 'root',
  password: 'your_db_password',
  database: 'jain_pathshala'
};

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });

  let conn;
  try {
    conn = await mysql.createConnection(DB);
    const [rows] = await conn.execute('SELECT id, username, password_hash FROM users WHERE username = ?', [username]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // Success: respond with basic user info (don't return password hash)
    return res.json({ message: 'Login successful', user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    if (conn) await conn.end();
  }
});

app.listen(3000, () => console.log('Listening on :3000'));