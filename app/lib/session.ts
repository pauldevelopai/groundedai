// Reads the Anchor session cookie and verifies it. Returns the decoded session
// claims ({ userId, newsroomId, role }) or null if no/invalid token.
// Use this from server components and route handlers to gate access.

import { cookies } from 'next/headers';
import { COOKIE_NAME, verifyToken } from '@/lib/auth';

export type Session = {
  userId: string;
  newsroomId: string;
  role: 'builder' | 'user' | 'admin';
};

export async function getCurrentSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token) as Session | null;
}
