import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import { sendEmail, generateWelcomeEmail } from '@freelance-os/email';
import { getJMAPConfig, getCompanyName } from '@/lib/email';

// POST /api/clients/[id]/welcome - Send welcome email to client
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientId = parseInt(id);

    if (isNaN(clientId)) {
      return NextResponse.json(
        { error: 'Invalid client ID' },
        { status: 400 }
      );
    }

    // Fetch client
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
      },
    });

    if (!client) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    // Check if JMAP is configured
    let jmapConfig;
    try {
      jmapConfig = await getJMAPConfig();
    } catch (error) {
      return NextResponse.json(
        { error: 'Email service not configured. Please configure email settings in Settings page.' },
        { status: 503 }
      );
    }

    // Generate email content
    const companyName = await getCompanyName();
    const portalUrl = process.env.CLIENT_PORTAL_URL || process.env.NEXTAUTH_URL;

    const emailContent = generateWelcomeEmail({
      client,
      companyName,
      portalUrl,
    });

    // Send email
    await sendEmail(jmapConfig, {
      to: client.email,
      ...emailContent,
    });

    return NextResponse.json({
      success: true,
      message: `Welcome email sent to ${client.email}`,
    });
  } catch (error) {
    console.error('Error sending welcome email:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        error: 'Failed to send welcome email',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
