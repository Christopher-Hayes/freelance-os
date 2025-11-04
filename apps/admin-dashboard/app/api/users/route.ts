import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';

// GET /api/users - List all users
export async function GET(request: NextRequest) {
  try {
    const users = await prisma.user.findMany({
      include: {
        sessions: {
          orderBy: { expires: 'desc' },
          take: 1,
        },
        _count: {
          select: { sessions: true },
        },
      },
      orderBy: { email: 'asc' },
    });

    // Format the response with additional computed fields
    const formattedUsers = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      clientId: user.clientId,
      lastLogin: user.sessions[0]?.expires
        ? new Date(user.sessions[0].expires.getTime() - 30 * 24 * 60 * 60 * 1000) // Approximate last login (session created 30 days before expiry)
        : null,
      sessionCount: user._count.sessions,
      createdAt: user.emailVerified, // emailVerified is set when user first logs in
    }));

    return NextResponse.json({ users: formattedUsers });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// POST /api/users - Create a new user (send invitation)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, clientId } = body;

    // Validate required fields
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // If clientId is provided, verify client exists
    if (clientId) {
      const client = await prisma.client.findUnique({
        where: { id: parseInt(clientId) },
      });

      if (!client) {
        return NextResponse.json(
          { error: 'Client not found' },
          { status: 404 }
        );
      }
    }

    // Create the user
    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        clientId: clientId ? parseInt(clientId) : null,
      },
    });

    return NextResponse.json(
      { user, message: 'User created successfully. They can now sign in via the client portal.' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
