// Auth bridge (H2): the absorbed Tracker authorizes off GROUNDED's session, not
// its own login. GROUNDED signs the `anchor_token` cookie as
//   jwt.sign({ sub: userId, nrm: newsroomId, role }, JWT_SECRET, { 7d })
// (see groundedai/lib/auth.js). We verify the SAME cookie with the SAME secret,
// so an admin signed into grounded uses the Tracker admin without a second login.
// JWT_SECRET must match grounded's (set in tracker/.env).
import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'anchor_token';

function readSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const d = jwt.verify(token, process.env.JWT_SECRET);
    return { userId: d.sub, newsroomId: d.nrm, role: d.role, id: d.sub };
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ message: 'Not authenticated' });
  req.user = session;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    const session = readSession(req);
    if (!session) return res.status(401).json({ message: 'Not authenticated' });
    if (roles.length && !roles.includes(session.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    req.user = session;
    next();
  };
}
