import express from 'express';
import { createOrLoginUser, getUserById } from '../services/userService.js';
import { isValidEmail } from '../services/email.js';

const router = express.Router();

// Login or create user
router.post('/login', (req, res) => {
  try {
    const { username, email } = req.body;

    if (!username || typeof username !== 'string' || username.trim().length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters' });
    }

    if (username.trim().length > 50) {
      return res.status(400).json({ error: 'Username must be less than 50 characters' });
    }

    const normalizedEmail = typeof email === 'string' ? email.trim() : '';
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    let user;
    try {
      user = createOrLoginUser(username.trim(), normalizedEmail);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Failed to login' });
    }

    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.email = user.email || normalizedEmail;

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email || normalizedEmail,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: true });
  });
});

// Get current user
router.get('/current', (req, res) => {
  if (!req.session?.userId) {
    return res.json({ user: null });
  }

  try {
    const user = getUserById(req.session.userId);

    if (!user) {
      req.session.destroy();
      return res.json({ user: null });
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email || null,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;
