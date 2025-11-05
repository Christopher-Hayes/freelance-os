import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { getAdminAuth } from "@/lib/auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check if API key exists
    const existingKey = await prisma.apiKey.findUnique({
      where: { id },
    });

    if (!existingKey) {
      return NextResponse.json(
        { error: "API key not found" },
        { status: 404 }
      );
    }

    await prisma.apiKey.delete({
      where: { id },
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
