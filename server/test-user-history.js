import { getDatabase } from './src/db/database.js';

const db = getDatabase();

// Check users
console.log('=== USERS ===');
const users = db.prepare('SELECT * FROM users').all();
console.log(users);

// Check history with user_id
console.log('\n=== HISTORY (with user_id) ===');
const history = db.prepare('SELECT id, user_id, action_type, created_at FROM history').all();
console.log(history);
