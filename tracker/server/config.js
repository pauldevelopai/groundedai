import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env'), override: true });

export default {
  port: parseInt(process.env.SERVER_PORT || process.env.PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/holly',
  jwtSecret: process.env.JWT_SECRET || 'change-me-to-a-random-string',
  adminEmail: process.env.ADMIN_EMAIL || 'paul@developai.co.za',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/gmail/callback',
};
