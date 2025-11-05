import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { getClientAuth } from "@/lib/auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authData = await getClientAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Only allow users to revoke their own API keys
    await prisma.apiKey.deleteMany({
      where: {
        id,
        userId: authData.userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error revoking API key:", error);
    return NextResponse.json(
      { error: "Failed to revoke API key" },
      { status: 500 }
    );
  }
}
