const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const admins = [
  {
    username: 'admin1',
    password: 'Admin@123',
    name: 'Pathshala Admin 1',
    email: 'admin1@pathshala.com'
  },
  {
    username: 'admin2',
    password: 'Admin@456',
    name: 'Pathshala Admin 2',
    email: 'admin2@pathshala.com'
  },
  {
    username: 'admin3',
    password: 'Admin@789',
    name: 'Pathshala Admin 3',
    email: 'admin3@pathshala.com'
  }
];

async function createAdmins() {
  const client = await pool.connect();
  
  try {
    // Create admins table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create pending tables if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS pending_attendance (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        reviewed_by INTEGER REFERENCES admins(id),
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, date)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pending_gatha (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        sutra_name VARCHAR(255) NOT NULL,
        which_gatha VARCHAR(255) NOT NULL,
        total_gatha INTEGER NOT NULL,
        date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        reviewed_by INTEGER REFERENCES admins(id),
        reviewed_at TIMESTAMP,
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Tables created successfully');

    // Insert admins
    for (const admin of admins) {
      const passwordHash = await bcrypt.hash(admin.password, 10);
      
      try {
        await client.query(
          `INSERT INTO admins (username, password_hash, name, email)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (username) DO UPDATE SET
             password_hash = $2,
             name = $3,
             email = $4`,
          [admin.username, passwordHash, admin.name, admin.email]
        );
        console.log(`Admin created/updated: ${admin.username}`);
      } catch (err) {
        console.error(`Error creating admin ${admin.username}:`, err.message);
      }
    }

    console.log('\n✅ All admins created successfully!');
    console.log('\nAdmin Credentials:');
    console.log('-------------------');
    admins.forEach(a => {
      console.log(`Username: ${a.username} | Password: ${a.password}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    pool.end();
  }
}

createAdmins();
