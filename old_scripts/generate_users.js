const bcrypt = require('bcryptjs');

// All 34 real users with password "2025-01-01"
const usersToGenerate = [
  { username: "Aditi", password: "2025-01-01" },
  { username: "Ariha", password: "2025-01-01" },
  { username: "Ashvi", password: "2025-01-01" },
  { username: "Belaben", password: "2025-01-01" },
  { username: "Bhavnaben", password: "2025-01-01" },
  { username: "Devanshiben", password: "2025-01-01" },
  { username: "Dhanvi", password: "2025-01-01" },
  { username: "Falguniben", password: "2025-01-01" },
  { username: "Hareshbhai", password: "2025-01-01" },
  { username: "Harshaben", password: "2025-01-01" },
  { username: "Heliben", password: "2025-01-01" },
  { username: "Hinaben", password: "2025-01-01" },
  { username: "Jainam", password: "2025-01-01" },
  { username: "Jigishaben", password: "2025-01-01" },
  { username: "Kaushikaben", password: "2025-01-01" },
  { username: "Keyan", password: "2025-01-01" },
  { username: "Khushbuben", password: "2025-01-01" },
  { username: "Moksh", password: "2025-01-01" },
  { username: "Moxa", password: "2025-01-01" },
  { username: "Naynaben", password: "2025-01-01" },
  { username: "Nayra", password: "2025-01-01" },
  { username: "Nidhiben", password: "2025-01-01" },
  { username: "Parulben", password: "2025-01-01" },
  { username: "Payalben", password: "2025-01-01" },
  { username: "Prakhar", password: "2025-01-01" },
  { username: "Rajalben", password: "2025-01-01" },
  { username: "Reshmaben", password: "2025-01-01" },
  { username: "Ritaben", password: "2025-01-01" },
  { username: "Saritaben", password: "2025-01-01" },
  { username: "Satva", password: "2025-01-01" },
  { username: "Shitalben", password: "2025-01-01" },
  { username: "Venya", password: "2025-01-01" },
  { username: "Virti", password: "2025-01-01" },
  { username: "Vivan", password: "2025-01-01" }
];

async function generateUserSQL() {
  console.log("USE jain_pathshala;");
  console.log("INSERT INTO users (username, password_hash) VALUES");

  const sqlValues = [];
  
  for (const user of usersToGenerate) {
    // Generate real bcrypt hash with 10 salt rounds
    const hash = await bcrypt.hash(user.password, 10);
    sqlValues.push(`  ('${user.username}', '${hash}')`);
  }
  
  console.log(sqlValues.join(',') + ';');
  console.log('--- Login Credentials for Distribution ---');

  usersToGenerate.forEach((user, index) => {
    console.log(`${(index + 1).toString().padStart(2)}. Username: ${user.username.padEnd(15)} | Password: ${user.password}`);
  });
}

generateUserSQL().catch(console.error);