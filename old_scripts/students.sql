-- Existing students table (keep as is)

-- NEW: Admins table
CREATE TABLE admins (
id SERIAL PRIMARY KEY,
username VARCHAR(50) UNIQUE NOT NULL,
password_hash VARCHAR(255) NOT NULL,
name VARCHAR(100) NOT NULL,
email VARCHAR(100),
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- NEW: Pending Attendance table
CREATE TABLE pending_attendance (
id SERIAL PRIMARY KEY,
student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
date DATE NOT NULL,
status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
reviewed_by INTEGER REFERENCES admins(id),
reviewed_at TIMESTAMP,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
UNIQUE(student_id, date)
);

-- NEW: Pending Gatha table
CREATE TABLE pending_gatha (
id SERIAL PRIMARY KEY,
student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
type VARCHAR(20) NOT NULL, -- 'new' or 'revision'
sutra_name VARCHAR(255) NOT NULL,
which_gatha VARCHAR(255) NOT NULL,
total_gatha INTEGER NOT NULL,
date DATE NOT NULL,
status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
reviewed_by INTEGER REFERENCES admins(id),
reviewed_at TIMESTAMP,
rejection_reason TEXT,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Modify existing attendance table (add approved_from_pending column)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS
pending_id INTEGER REFERENCES pending_attendance(id);

-- Modify existing gatha table (add approved_from_pending column)
ALTER TABLE gatha ADD COLUMN IF NOT EXISTS
pending_id INTEGER REFERENCES pending_gatha(id);
