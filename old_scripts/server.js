// api/index.js - Vercel Serverless Function
const serverless = require('serverless-http');
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// CORS configuration
app.use(cors({ 
  origin: 'https://jain-pathshala.vercel.app', 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// --- Configuration ---
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;
const DB_NAME = process.env.DB_NAME || 'jainpathshala';

// --- MongoDB Connection (Singleton for Vercel) ---
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  // Reuse connection if exists
  if (cachedDb && cachedClient) {
    console.log('✅ Reusing existing MongoDB connection');
    return { client: cachedClient, db: cachedDb };
  }

  // Validate environment variables
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not set. Please configure it in Vercel dashboard.');
  }

  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set. Please configure it in Vercel dashboard.');
  }

  try {
    console.log('🔄 Creating new MongoDB connection...');
    
    const client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    await client.connect();
    
    // Verify connection
    await client.db('admin').command({ ping: 1 });
    
    const db = client.db(DB_NAME);
    
    // Create indexes
    try {
      await db.collection('users').createIndex({ username: 1 }, { unique: true });
      await db.collection('attendance').createIndex({ user_id: 1, date: 1 }, { unique: true });
      await db.collection('gatha_entries').createIndex({ user_id: 1, created_at: 1 });
      console.log('✅ Database indexes created');
    } catch (indexErr) {
      console.warn('⚠️ Index creation warning:', indexErr.message);
    }

    cachedClient = client;
    cachedDb = db;
    
    console.log('✅ MongoDB connected successfully');
    return { client, db };
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    throw error;
  }
}

// --- Middleware to ensure DB connection ---
async function ensureDbConnection(req, res, next) {
  try {
    const { db } = await connectToDatabase();
    req.db = db;
    next();
  } catch (error) {
    console.error('Database connection error:', error);
    return res.status(503).json({ 
      error: 'Database connection failed',
      details: error.message,
      hint: 'Check if MONGODB_URI is set in Vercel environment variables'
    });
  }
}

// --- Auth Middleware ---
function authMiddleware(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(500).json({ error: 'Server configuration error: JWT_SECRET missing' });
  }
  
  const auth = req.headers.authorization;
  if (!auth) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({ error: 'Invalid Authorization header format' });
  }

  try {
    const payload = jwt.verify(parts[1], JWT_SECRET);
    if (!payload || !payload.id) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    
    req.user = {
      id: payload.id,
      username: payload.username,
      _id: new ObjectId(payload.id)
    };
    next();
  } catch (err) {
    console.error('Auth verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// --- Request Logger ---
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// --- Utility Functions ---
function getCurrentYearRange() {
  const now = new Date();
  const year = now.getFullYear();
  return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

function safeDateString(value) {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  if (s.length >= 10) return s.slice(0, 10);
  return s;
}

// --- DIAGNOSTIC ENDPOINT (Check this first!) ---
app.get('/api/config-check', (req, res) => {
  const config = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    vercel: process.env.VERCEL ? 'Yes' : 'No',
    environmentVariables: {
      MONGODB_URI: MONGODB_URI ? '✅ Set' : '❌ Missing',
      JWT_SECRET: JWT_SECRET ? '✅ Set' : '❌ Missing',
      DB_NAME: DB_NAME || 'jainpathshala'
    },
    database: {
      hasConnection: cachedDb ? 'Yes' : 'No',
      dbName: DB_NAME
    }
  };
  
  res.json(config);
});

// --- Health Check ---
app.get('/api/health', async (req, res) => {
  try {
    const { client } = await connectToDatabase();
    await client.db('admin').command({ ping: 1 });
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      dbName: DB_NAME
    });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(503).json({ 
      status: 'error', 
      message: 'Database connection failed',
      error: err.message,
      hint: 'Check MONGODB_URI in Vercel environment variables'
    });
  }
});

// --- Register ---
app.post('/api/register', ensureDbConnection, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await req.db.collection('users').insertOne({
      username,
      password_hash,
      created_at: new Date()
    });

    res.json({
      id: result.insertedId.toString(),
      username
    });
  } catch (error) {
    console.error('Register error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

// --- Login ---
app.post('/api/login', ensureDbConnection, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await req.db.collection('users').findOne({ username });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        id: user._id.toString(),
        username: user.username
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      user: { 
        id: user._id.toString(), 
        name: user.username,
        username: user.username 
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// --- WhoAmI ---
app.get('/api/whoami', authMiddleware, (req, res) => {
  res.json({
    userId: req.user.id,
    username: req.user.username,
    authenticatedAt: new Date().toISOString(),
  });
});

// --- Mark Attendance ---
app.post('/api/attendance/mark', authMiddleware, ensureDbConnection, async (req, res) => {
  try {
    const userObjId = req.user._id;
    const username = req.user.username;
    const today = new Date().toISOString().slice(0, 10);

    const result = await req.db.collection('attendance').updateOne(
      { user_id: userObjId, date: today },
      {
        $set: {
          user_id: userObjId,
          username,
          date: today,
          created_at: new Date()
        }
      },
      { upsert: true }
    );

    res.json({
      success: true,
      date: today,
      affectedRows: result.upsertedCount || result.modifiedCount || 0
    });
  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({ error: 'Failed to mark attendance', details: error.message });
  }
});

// --- Unmark Attendance ---
app.post('/api/attendance/unmark', authMiddleware, ensureDbConnection, async (req, res) => {
  try {
    const userObjId = req.user._id;
    const today = new Date().toISOString().slice(0, 10);

    await req.db.collection('attendance').deleteOne({ user_id: userObjId, date: today });
    res.json({ success: true });
  } catch (error) {
    console.error('Unmark attendance error:', error);
    res.status(500).json({ error: 'Failed to unmark attendance', details: error.message });
  }
});

// --- Get Attendance ---
app.get('/api/attendance', authMiddleware, ensureDbConnection, async (req, res) => {
  try {
    const userObjId = req.user._id;

    const rows = await req.db.collection('attendance')
      .find({ user_id: userObjId })
      .sort({ date: -1 })
      .toArray();

    const out = rows.map(r => ({
      ...r,
      _id: r._id.toString(),
      user_id: r.user_id.toString()
    }));

    res.json(out);
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance', details: error.message });
  }
});

// --- Create Gatha ---
app.post('/api/gatha', authMiddleware, ensureDbConnection, async (req, res) => {
  try {
    const userObjId = req.user._id;
    const { type, sutra_name, which_gatha, total_gatha } = req.body || {};

    if (!type || (type !== 'new' && type !== 'revision')) {
      return res.status(400).json({ error: 'Type must be "new" or "revision"' });
    }

    const entry = {
      user_id: userObjId,
      type,
      sutra_name: sutra_name || null,
      which_gatha: which_gatha || null,
      total_gatha: total_gatha ?? null,
      created_at: new Date()
    };

    const result = await req.db.collection('gatha_entries').insertOne(entry);

    const insertedEntry = await req.db.collection('gatha_entries').findOne({
      _id: result.insertedId
    });

    res.json({
      id: result.insertedId.toString(),
      entry: {
        ...insertedEntry,
        id: insertedEntry._id.toString(),
        user_id: insertedEntry.user_id.toString()
      }
    });
  } catch (error) {
    console.error('Create gatha error:', error);
    res.status(500).json({ error: 'Failed to create gatha entry', details: error.message });
  }
});

// --- Get Gathas ---
app.get('/api/gatha', authMiddleware, ensureDbConnection, async (req, res) => {
  try {
    const userObjId = req.user._id;

    const rows = await req.db.collection('gatha_entries')
      .find({ user_id: userObjId })
      .sort({ created_at: -1 })
      .toArray();

    const formattedRows = rows.map(row => ({
      ...row,
      id: row._id.toString(),
      user_id: row.user_id.toString()
    }));

    res.json(formattedRows);
  } catch (error) {
    console.error('Get gathas error:', error);
    res.status(500).json({ error: 'Failed to fetch gathas', details: error.message });
  }
});

// --- Update Gatha ---
app.put('/api/gatha/:id', authMiddleware, ensureDbConnection, async (req, res) => {
  try {
    const userObjId = req.user._id;
    const entryId = req.params.id;
    const { type, sutra_name, which_gatha, total_gatha } = req.body || {};

    if (type && type !== 'new' && type !== 'revision') {
      return res.status(400).json({ error: 'Type must be "new" or "revision"' });
    }

    const updateDoc = {};
    if (type !== undefined) updateDoc.type = type;
    if (sutra_name !== undefined) updateDoc.sutra_name = sutra_name;
    if (which_gatha !== undefined) updateDoc.which_gatha = which_gatha;
    if (total_gatha !== undefined) updateDoc.total_gatha = total_gatha;

    const result = await req.db.collection('gatha_entries').updateOne(
      { _id: new ObjectId(entryId), user_id: userObjId },
      { $set: updateDoc }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Entry not found or not owned by you' });
    }

    const updatedEntry = await req.db.collection('gatha_entries').findOne({
      _id: new ObjectId(entryId)
    });

    res.json({
      success: true,
      entry: {
        ...updatedEntry,
        id: updatedEntry._id.toString(),
        user_id: updatedEntry.user_id.toString()
      }
    });
  } catch (error) {
    console.error('Update gatha error:', error);
    res.status(500).json({ error: 'Failed to update gatha', details: error.message });
  }
});

// --- Delete Gatha ---
app.delete('/api/gatha/:id', authMiddleware, ensureDbConnection, async (req, res) => {
  try {
    const userObjId = req.user._id;
    const entryId = req.params.id;

    const result = await req.db.collection('gatha_entries').deleteOne({
      _id: new ObjectId(entryId),
      user_id: userObjId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Entry not found or not owned by you' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete gatha error:', error);
    res.status(500).json({ error: 'Failed to delete gatha', details: error.message });
  }
});

// --- Yearly Stats ---
app.get('/api/stats/yearly', authMiddleware, ensureDbConnection, async (req, res) => {
  try {
    const userObjId = req.user._id;
    const { startDate, endDate } = getCurrentYearRange();

    const totalDaysPresent = await req.db.collection('attendance').countDocuments({
      user_id: userObjId,
      date: { $gte: startDate, $lte: endDate }
    });

    res.json({
      totalDaysPresent,
      year: new Date().getFullYear()
    });
  } catch (error) {
    console.error('Yearly stats error:', error);
    res.status(500).json({ error: 'Failed to fetch yearly stats', details: error.message });
  }
});

// --- Analytics Leaderboard ---
app.get('/api/analytics/leaderboard', authMiddleware, ensureDbConnection, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate query parameters are required' });
    }

    // Gatha counts
    const gathaPipeline = [
      {
        $match: {
          type: 'new',
          created_at: {
            $gte: new Date(startDate),
            $lte: new Date(endDate + 'T23:59:59.999Z')
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $group: {
          _id: '$user_id',
          username: { $first: '$user.username' },
          gatha_count: { $sum: { $ifNull: ['$total_gatha', 0] } }
        }
      }
    ];

    const gathaCounts = await req.db.collection('gatha_entries').aggregate(gathaPipeline).toArray();
    const gathaMap = new Map(gathaCounts.map(r => [r._id.toString(), Number(r.gatha_count || 0)]));

    // Attendance counts
    const attendancePipeline = [
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$user_id',
          attendance_count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' }
    ];

    const attendanceCounts = await req.db.collection('attendance').aggregate(attendancePipeline).toArray();

    let totalAttendance = 0;
    attendanceCounts.forEach(row => (totalAttendance += Number(row.attendance_count || 0)));

    const leaderboard = attendanceCounts.map(u => ({
      username: u.user.username,
      user_id: u._id.toString(),
      attendance_count: Number(u.attendance_count || 0),
      gatha_count: gathaMap.get(u._id.toString()) || 0
    })).sort((a, b) => {
      if (a.attendance_count !== b.attendance_count) return b.attendance_count - a.attendance_count;
      return b.gatha_count - a.gatha_count;
    });

    const totalPathshalaGathas = gathaCounts.reduce((sum, r) => sum + Number(r.gatha_count || 0), 0);

    let gathaLeader = null;
    if (gathaCounts.length > 0) {
      const top = [...gathaCounts].sort((a, b) => Number(b.gatha_count || 0) - Number(a.gatha_count || 0))[0];
      gathaLeader = { username: top.username, count: Number(top.gatha_count || 0) };
    }

    const currentUserGathaCount = await req.db.collection('gatha_entries').aggregate([
      {
        $match: {
          user_id: req.user._id,
          type: 'new',
          created_at: {
            $gte: new Date(startDate),
            $lte: new Date(endDate + 'T23:59:59.999Z')
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$total_gatha', 0] } }
        }
      }
    ]).toArray();

    const userGathaTotal = currentUserGathaCount.length > 0 ? currentUserGathaCount[0].total : 0;

    res.json({
      attendanceLeader: leaderboard.length > 0 ? leaderboard[0] : { username: 'N/A', attendance_count: 0, gatha_count: 0 },
      gathaStats: {
        totalPathshalaGathas,
        gathaLeader: gathaLeader || { username: 'N/A', count: 0 },
        totalAttendance
      },
      currentUserNewGathas: Number(userGathaTotal)
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics', details: error.message });
  }
});

// --- History ---
app.get('/api/history/:year/:month', authMiddleware, ensureDbConnection, async (req, res) => {
  try {
    const userObjId = req.user._id;
    const { year: yearStr, month: monthStr } = req.params;

    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid year or month parameter' });
    }

    const paddedMonth = String(month).padStart(2, '0');
    const startRange = `${year}-${paddedMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endRange = `${year}-${paddedMonth}-${String(lastDay).padStart(2, '0')}`;

    const gathaDetails = await req.db.collection('gatha_entries')
      .find({
        user_id: userObjId,
        created_at: {
          $gte: new Date(startRange),
          $lte: new Date(endRange + 'T23:59:59.999Z')
        }
      })
      .sort({ created_at: 1 })
      .toArray();

    const attendance = await req.db.collection('attendance')
      .find({
        user_id: userObjId,
        date: { $gte: startRange, $lte: endRange }
      })
      .toArray();

    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyActivity = {};

    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${paddedMonth}-${String(i).padStart(2, '0')}`;
      dailyActivity[dateStr] = {
        present: false,
        gathas: { new: 0, revision: 0 },
        details: []
      };
    }

    attendance.forEach((att) => {
      const dateStr = safeDateString(att.date);
      if (dateStr && dailyActivity[dateStr]) {
        dailyActivity[dateStr].present = true;
      }
    });

    gathaDetails.forEach((entry) => {
      const dateStr = safeDateString(entry.created_at);
      if (!dateStr || !dailyActivity[dateStr]) return;

      const count = Number(entry.total_gatha || 0);
      if (entry.type === 'new') dailyActivity[dateStr].gathas.new += count;
      else if (entry.type === 'revision') dailyActivity[dateStr].gathas.revision += count;

      dailyActivity[dateStr].details.push({
        id: entry._id.toString(),
        type: entry.type,
        sutra_name: entry.sutra_name,
        which_gatha: entry.which_gatha,
        total_gatha: entry.total_gatha
      });
    });

    res.json({ year, month, dailyActivity });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to fetch history', details: error.message });
  }
});

// --- 404 Handler ---
app.use((req, res) => {
  console.log(`❌ 404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// --- Error Handler ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error', 
    details: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred' 
  });
});

// Export for Vercel
module.exports = serverless(app);

