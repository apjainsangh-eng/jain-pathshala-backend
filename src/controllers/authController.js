const { getCollection } = require('../config/db');
const { ADMIN_USERS, LEGACY_STUDENTS_MAP } = require('../config/constants');
const { createToken } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

exports.loginUser = async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const usersCollection = await getCollection('users');
    if (!usersCollection) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const studentKey = username.toLowerCase().trim();
    const dbUser = await usersCollection.findOne({
      username: { $regex: new RegExp('^' + studentKey + '$', 'i') }
    });

    // If not in DB yet, try lazy migration from legacy list
    if (!dbUser) {
      const legacy = LEGACY_STUDENTS_MAP[studentKey];
      if (!legacy) {
        return res.status(401).json({ error: 'User not found' });
      }
      // Password must match the default before we create the record
      if (password !== legacy.password) {
        return res.status(401).json({ error: 'Invalid password' });
      }
      // Create in DB on-the-fly
      try {
        await usersCollection.insertOne({
          username: legacy.username,
          name: legacy.name,
          role: 'student',
          password: legacy.password,
          migrated: true,
          created_at: new Date().toISOString()
        });
      } catch (e) {
        console.error('Lazy migration insert error:', e);
      }
      const token = createToken({
        id: legacy.username,
        username: legacy.username,
        name: legacy.name,
        role: 'student'
      });
      return res.json({
        user: { id: legacy.username, username: legacy.username, name: legacy.name, role: 'student' },
        token,
        familyGroup: { groupName: null, members: [] }
      });
    }

    let isPasswordValid = false;

    // 1. Check passwords collection (user changed their password)
    try {
      const passwords = await getCollection('passwords');
      if (passwords) {
        const savedPassword = await passwords.findOne({ username: dbUser.username });
        if (savedPassword && savedPassword.password_hash) {
          isPasswordValid = await bcrypt.compare(password, savedPassword.password_hash);
        }
      }
    } catch (e) {
      console.error('Password check error:', e);
    }

    // 2. Check password_hash on the user record (set by admin on creation)
    if (!isPasswordValid && dbUser.password_hash) {
      isPasswordValid = await bcrypt.compare(password, dbUser.password_hash);
    }

    // 3. Check plain text password (legacy migrated students)
    if (!isPasswordValid && dbUser.password) {
      isPasswordValid = password === dbUser.password;
    }

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Check for family group
    let familyMembers = [];
    let groupName = null;

    try {
      const groups = await getCollection('family_groups');
      if (groups) {
        const userGroup = await groups.findOne({ members: dbUser.username });
        if (userGroup) {
          groupName = userGroup.groupName;
          const memberUsernames = userGroup.members;
          const memberDocs = await usersCollection
            .find({ username: { $in: memberUsernames } })
            .toArray();
          const memberMap = {};
          memberDocs.forEach(m => { memberMap[m.username] = m.name || m.username; });

          familyMembers = memberUsernames.map(uname => ({
            username: uname,
            name: memberMap[uname] || uname,
            isCurrent: uname === dbUser.username
          }));
        }
      }
    } catch (e) {
      console.error('Family group check error:', e);
    }

    const token = createToken({
      id: dbUser.username,
      username: dbUser.username,
      name: dbUser.name || dbUser.username,
      role: 'student'
    });

    res.json({
      user: {
        id: dbUser.username,
        username: dbUser.username,
        name: dbUser.name || dbUser.username,
        role: 'student'
      },
      token,
      familyGroup: { groupName, members: familyMembers }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

exports.loginAdmin = async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Credentials required' });
    }

    const adminKey = username.toLowerCase().trim();
    const admin = ADMIN_USERS[adminKey];

    if (!admin || password !== admin.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      user: { id: admin.id, username: adminKey, name: admin.name, role: 'admin' },
      token: createToken({ id: admin.id, username: adminKey, name: admin.name, role: 'admin' })
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};
