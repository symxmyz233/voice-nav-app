import { getDatabase } from '../db/database.js';

export function createOrLoginUser(username, email = null) {
  const db = getDatabase();
  const normalizedEmail = typeof email === 'string' && email.trim() ? email.trim() : null;

  if (!normalizedEmail) {
    throw new Error('Email is required');
  }

  // Check if user exists by email (case-insensitive)
  let user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(normalizedEmail);

  if (!user) {
    // If username exists, allow linking email once (legacy users)
    const existingUsername = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
    if (existingUsername) {
      if (existingUsername.email && existingUsername.email.trim()) {
        throw new Error('Username is already taken');
      }

      db.prepare("UPDATE users SET last_login = datetime('now'), email = ? WHERE id = ?")
        .run(normalizedEmail, existingUsername.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(existingUsername.id);
      console.log('Linked email to existing user:', username);
    } else {
      // Create new user
      const result = db.prepare(
        'INSERT INTO users (username, email) VALUES (?, ?)'
      ).run(username, normalizedEmail);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
      console.log('Created new user:', username);
    }
  } else {
    // Email already registered - username must match
    const existingUsername = String(user.username || '').toLowerCase();
    const incomingUsername = String(username || '').trim().toLowerCase();
    if (existingUsername && incomingUsername && existingUsername !== incomingUsername) {
      throw new Error('This email is already registered with a different username');
    }

    // Update last login (and normalize email in case of casing differences)
    db.prepare("UPDATE users SET last_login = datetime('now'), email = ? WHERE id = ?")
      .run(normalizedEmail, user.id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    console.log('User logged in:', username);
  }

  return user;
}

export function getUserById(userId) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

export function getAllUsers() {
  const db = getDatabase();
  return db.prepare('SELECT id, username, created_at, last_login FROM users ORDER BY last_login DESC').all();
}
