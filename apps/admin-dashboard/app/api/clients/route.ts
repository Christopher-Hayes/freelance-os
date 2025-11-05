import { NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import type { Client } from '@freelance-os/types';
import { getAdminAuth } from '@/lib/auth';

// GET /api/clients - List all clients
export async function GET() {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clients = await prisma.client.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        _count: {
          select: {
            projects: true,
            invoices: true,
          },
        },
      },
    });

    return NextResponse.json(clients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clients' },
      { status: 500 }
    );
  }
}

// POST /api/clients - Create a new client
export async function POST(request: Request) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate required fields
    if (!body.name || !body.email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingClient = await prisma.client.findUnique({
      where: { email: body.email },
    });

    if (existingClient) {
      return NextResponse.json(
        { error: 'A client with this email already exists' },
        { status: 409 }
      );
    }

    const client = await prisma.client.create({
      data: {
        name: body.name,
        email: body.email,
        company: body.company || null,
      },
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error('Error creating client:', error);
    return NextResponse.json(
      { error: 'Failed to create client' },
      { status: 500 }
    );
  }
}
