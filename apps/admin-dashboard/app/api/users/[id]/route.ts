import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET /api/users/[id] - Get a single user
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        sessions: {
          orderBy: { expires: 'desc' },
          take: 5,
        },
        accounts: true,
        _count: {
          select: { sessions: true, accounts: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If user has a clientId, fetch client details
    let client = null;
    if (user.clientId) {
      client = await prisma.client.findUnique({
        where: { id: user.clientId },
        select: {
          id: true,
          name: true,
          email: true,
          company: true,
        },
      });
    }

    return NextResponse.json({
      user: {
        ...user,
        client,
      },
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// PUT /api/users/[id] - Update a user (link/unlink client, update name)
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { name, email, clientId } = body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If email is being updated, check it's not already taken
    if (email && email !== existingUser.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email },
      });

      if (emailTaken) {
        return NextResponse.json(
          { error: 'Email already in use' },
          { status: 400 }
        );
      }
    }

    // If clientId is provided, verify client exists
    if (clientId !== undefined && clientId !== null) {
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

    // Update the user
    const user = await prisma.user.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        email: email !== undefined ? email : undefined,
        clientId: clientId !== undefined ? (clientId ? parseInt(clientId) : null) : undefined,
      },
      include: {
        sessions: {
          orderBy: { expires: 'desc' },
          take: 1,
        },
      },
    });

    // Fetch client details if linked
    let client = null;
    if (user.clientId) {
      client = await prisma.client.findUnique({
        where: { id: user.clientId },
        select: {
          id: true,
          name: true,
          email: true,
          company: true,
        },
      });
    }

    return NextResponse.json({
      user: {
        ...user,
        client,
      },
      message: 'User updated successfully',
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[id] - Delete a user
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Delete the user (cascade will delete sessions and accounts)
    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
