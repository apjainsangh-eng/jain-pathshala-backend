const ADMIN_USERS = {
  'sannibhai': { id: 'Sannibhai', name: 'Sanni Bhai', password: 'S@123' },
  'admin2': { id: 'admin2', name: 'Jainam', password: 'Admin@456' },
  'nayanbhai': { id: 'Nayanbhai', name: 'Nayanbhai', password: 'Nayanbhai@123' }
};

// Default students — used for lazy migration on first login if not yet in DB
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

// Build a quick lookup map keyed by lowercase username
const LEGACY_STUDENTS_MAP = {};
LEGACY_STUDENTS.forEach(s => { LEGACY_STUDENTS_MAP[s.username.toLowerCase()] = s; });

module.exports = { ADMIN_USERS, LEGACY_STUDENTS, LEGACY_STUDENTS_MAP };
