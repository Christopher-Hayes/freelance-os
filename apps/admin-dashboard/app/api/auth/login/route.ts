import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { sessions, SESSION_DURATION } from '@/lib/sessions';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    console.log('[LOGIN] Password received:', !!password);
    console.log('[LOGIN] ADMIN_PASSWORD exists:', !!process.env.ADMIN_PASSWORD);
    console.log('[LOGIN] ADMIN_PASSWORD length:', process.env.ADMIN_PASSWORD?.length);

    if (!password) {
      console.log('[LOGIN] Error: No password provided');
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      console.log('[LOGIN] Error: ADMIN_PASSWORD not configured in env');
      return NextResponse.json({ error: 'Admin password not configured' }, { status: 500 });
    }

    // Verify password
    console.log('[LOGIN] Comparing passwords...');
    console.log('[LOGIN] Input password length:', password.length);
    console.log('[LOGIN] Admin password length:', adminPassword.length);
    console.log('[LOGIN] Passwords match:', password === adminPassword);
    
    if (password !== adminPassword) {
      console.log('[LOGIN] Error: Password mismatch');
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    console.log('[LOGIN] Password verified, creating session...');

    // Create session token
    const sessionToken = randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + SESSION_DURATION;

    // Store session
    sessions.set(sessionToken, {
      createdAt: now,
      expiresAt,
    });

    console.log('[LOGIN] Session created, setting cookie...');

    // Set session cookie
    const cookieStore = await cookies();
    cookieStore.set('admin-session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_DURATION / 1000, // Convert to seconds
      path: '/',
    });

    console.log('[LOGIN] Success!');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[LOGIN] Exception caught:', error);
    console.error('[LOGIN] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}

// Logout endpoint
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('admin-session')?.value;

    if (sessionToken) {
      sessions.delete(sessionToken);
    }

    cookieStore.delete('admin-session');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
