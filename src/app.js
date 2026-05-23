const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const gathaRoutes = require('./routes/gathaRoutes');
const statsRoutes = require('./routes/statsRoutes');
const adminRoutes = require('./routes/adminRoutes');
const miscRoutes = require('./routes/miscRoutes');
const exportRoutes = require('./routes/exportRoutes');

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.use(express.json());

// One-time migration: seed hardcoded students into users collection
const LEGACY_STUDENTS = [
  { username: 'Aditi', name: 'Aditi', password: 'Aditi123' },
  { username: 'Ariha', name: 'Ariha', password: 'Ariha123' },
  { username: 'Ashvi', name: 'Ashvi', password: 'Ashvi123' },
  { username: 'Belaben', name: 'Belaben', password: 'Belaben123' },
  { username: 'Bhavnaben', name: 'Bhavnaben', password: 'Bhavnaben123' },
  { username: 'Devanshiben', name: 'Devanshiben', password: 'Devanshiben123' },
  { username: 'Dhanvi', name: 'Dhanvi', password: 'Dhanvi123' },
  { username: 'Falguniben', name: 'Falguniben', password: 'Falguniben123' },
  { username: 'Hareshbhai', name: 'Hareshbhai', password: 'Hareshbhai123' },
  { username: 'Harshaben', name: 'Harshaben', password: 'Harshaben123' },
  { username: 'Heliben', name: 'Heliben', password: 'Heliben123' },
  { username: 'Hinaben', name: 'Hinaben', password: 'Hinaben123' },
  { username: 'Jainam', name: 'Jainam', password: 'Jainam123' },
  { username: 'Jigishaben', name: 'Jigishaben', password: 'Jigishaben123' },
  { username: 'Kaushikaben', name: 'Kaushikaben', password: 'Kaushikaben123' },
  { username: 'Keyan', name: 'Keyan', password: 'Keyan123' },
  { username: 'Khushbuben', name: 'Khushbuben', password: 'Khushbuben123' },
  { username: 'Moksh', name: 'Moksh', password: 'Moksh123' },
  { username: 'Moxa', name: 'Moxa', password: 'Moxa123' },
  { username: 'Naynaben', name: 'Naynaben', password: 'Naynaben123' },
  { username: 'Nayra', name: 'Nayra', password: 'Nayra123' },
  { username: 'Nidhiben', name: 'Nidhiben', password: 'Nidhiben123' },
  { username: 'Parulben', name: 'Parulben', password: 'Parulben123' },
  { username: 'Payalben', name: 'Payalben', password: 'Payalben123' },
  { username: 'Prakhar', name: 'Prakhar', password: 'Prakhar123' },
  { username: 'Rajalben', name: 'Rajalben', password: 'Rajalben123' },
  { username: 'Reshmaben', name: 'Reshmaben', password: 'Reshmaben123' },
  { username: 'Ritaben', name: 'Ritaben', password: 'Ritaben123' },
  { username: 'Saritaben', name: 'Saritaben', password: 'Saritaben123' },
  { username: 'Sattva', name: 'Sattva', password: 'Sattva123' },
  { username: 'Shitalben', name: 'Shitalben', password: 'Shitalben123' },
  { username: 'Venya', name: 'Venya', password: 'Venya123' },
  { username: 'Virti', name: 'Virti', password: 'Virti123' },
  { username: 'Vivan', name: 'Vivan', password: 'Vivan123' }
];

async function migrateStudentsToDb() {
  try {
    const { getCollection } = require('./config/db');
    const usersCollection = await getCollection('users');
    if (!usersCollection) return;

    for (const student of LEGACY_STUDENTS) {
      const existing = await usersCollection.findOne({
        username: { $regex: new RegExp('^' + student.username + '$', 'i') }
      });
      if (!existing) {
        await usersCollection.insertOne({
          username: student.username,
          name: student.name,
          role: 'student',
          password: student.password,
          migrated: true,
          created_at: new Date().toISOString()
        });
        console.log('Migrated student:', student.username);
      } else if (!existing.password && !existing.password_hash) {
        // Student exists but has no password — set default plain-text password
        await usersCollection.updateOne(
          { _id: existing._id },
          { $set: { password: student.password, migrated: true } }
        );
        console.log('Fixed missing password for:', student.username);
      }
    }
  } catch (e) {
    console.error('Migration error:', e);
  }
}

// Run migration on startup
migrateStudentsToDb();

// Main Health Check
app.get('/api/users', async (req, res) => {
  const { getCollection } = require('./config/db');
  let dbStatus = 'ok';
  let counts = { attendance: 0, gatha: 0, students: 0 };
  try {
    const attendance = await getCollection('attendance');
    const gatha = await getCollection('gatha');
    const users = await getCollection('users');
    if (!attendance || !gatha) {
      dbStatus = 'disconnected';
    } else {
      counts = {
        attendance: await attendance.countDocuments(),
        gatha: await gatha.countDocuments(),
        students: users ? await users.countDocuments({ role: 'student' }) : 0
      };
    }
  } catch (e) { dbStatus = 'error'; }
  res.json({ status: 'ok', database: dbStatus, counts, totalStudents: counts.students });
});

app.use('/api', authRoutes);
app.use('/api', studentRoutes);          // includes /family-members ...
app.use('/api/attendance', attendanceRoutes); // includes /mark, /mark-for ...
app.use('/api/gatha', gathaRoutes);           // includes standard gatha logic + root `/api/gatha-for` needs to be mapped inside gathaRoutes! Wait. 
// Ah! in api/index.js, `app.post('/api/gatha-for')` was at the root instead of `/api/gatha/for`.
// But I made it `router.post('/for')` in gathaRoutes, which means it is `/api/gatha/for`. This is cleaner but I need to make sure the frontend is updated or just revert it to `/api/gatha-for` here.
// Let's keep the API consistent so I don't have to touch the frontend!
// I'll map it to `/api/gatha` here, but I must map `/gatha-for` explicitly if it was root.
// Wait, in my `gathaRoutes.js`, I did `router.post('/for', ...)`. I am going to remap it so I don't break frontend!

app.post('/api/gatha-for', require('./middleware/auth').authenticate, require('./controllers/gathaController').addGathaFor);

app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', miscRoutes);                  // includes /leaderboard, /achievements, /profile, /change-password ...
app.use('/api/admin/export', require('./middleware/auth').authenticate, exportRoutes);

module.exports = app;
