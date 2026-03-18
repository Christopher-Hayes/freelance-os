import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import { getAdminAuth } from '@/lib/auth';
import { sendVerificationRequest } from '@/lib/auth-email';
import { randomBytes, createHash } from 'crypto';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/users/[id]/resend-verification - Send a magic link to the user's email
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate a verification token.
    // NextAuth v5 (@auth/core) hashes tokens as sha256(token + secret) before
    // storing them, and applies the same hash on the callback token before lookup.
    // The secret used is provider.secret ?? options.secret (i.e. NEXTAUTH_SECRET).
    // We must replicate this exactly so the callback can find and delete the record.
    const secret = process.env.NEXTAUTH_SECRET ?? '';
    const token = randomBytes(32).toString('hex');
    const hashedToken = createHash('sha256').update(`${token}${secret}`).digest('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.verificationToken.create({
      data: {
        identifier: user.email,
        token: hashedToken, // store the hash, send the raw token in the URL
        expires,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    // After successful verification, redirect to the dashboard with a flag so it
    // can show a confirmation toast.
    const afterVerifyUrl = `${baseUrl}/?verified=1`;
    const callbackUrl = `${baseUrl}/api/auth/callback/email?${new URLSearchParams({
      token,
      email: user.email,
      callbackUrl: afterVerifyUrl,
    })}`;

    await sendVerificationRequest({
      identifier: user.email,
      url: callbackUrl,
      provider: {
        from: process.env.JMAP_FROM || process.env.JMAP_USERNAME || 'noreply@example.com',
      },
    });

    return NextResponse.json({ message: `Verification email sent to ${user.email}` });
  } catch (error) {
    console.error('Error resending verification email:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send verification email' },
      { status: 500 }
    );
  }
}
