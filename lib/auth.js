// Auth helpers — JWT signing/verification + bcrypt password hashing.
// Lifted from holly/server/middleware/auth.js + holly/server/routes/auth.js,
// converted ESM → CommonJS. Pure helpers; no Next.js dependency so they
// can be reused from db/seed.js and any future workers.

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const TOKEN_EXPIRY = '7d';
const BCRYPT_ROUNDS = 10;
const COOKIE_NAME = 'anchor_token';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters.');
  }
  return secret;
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken({ userId, newsroomId, role }) {
  return jwt.sign(
    { sub: userId, nrm: newsroomId, role },
    getJwtSecret(),
    { expiresIn: TOKEN_EXPIRY }
  );
}

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    return {
      userId: decoded.sub,
      newsroomId: decoded.nrm,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
};
