// Authentication middleware

// Require authentication - blocks requests without valid session
export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  req.userId = req.session.userId;
  req.username = req.session.username;
  next();
}

// Optional authentication - passes userId if authenticated, null if guest
export function optionalAuth(req, res, next) {
  req.userId = req.session?.userId || null;
  req.username = req.session?.username || null;
  next();
}
