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
