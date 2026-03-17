import { prisma } from "@freelance-os/database";
import bcrypt from "bcryptjs";

/**
 * Ensure the initial admin user exists in the database.
 * Called during the first credentials login attempt.
 * Uses ADMIN_EMAIL and ADMIN_PASSWORD env vars.
 */
export async function ensureAdminUser(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@localhost";
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.warn("[Auth] ADMIN_PASSWORD env var not set - admin user cannot be created");
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existing) {
    // Update role to admin if it isn't already
    if (existing.role !== "admin") {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: "admin" },
      });
      console.log(`[Auth] Updated existing user ${adminEmail} to admin role`);
    }

    // Update password hash if it has changed
    if (existing.passwordHash) {
      const passwordMatch = await bcrypt.compare(adminPassword, existing.passwordHash);
      if (!passwordMatch) {
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        await prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash },
        });
        console.log(`[Auth] Updated admin password hash for ${adminEmail}`);
      }
    } else {
      // No password hash set yet - set it now
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash },
      });
      console.log(`[Auth] Set password hash for admin user ${adminEmail}`);
    }
    return;
  }

  // Create admin user
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.create({
    data: {
      email: adminEmail,
      name: "Admin",
      role: "admin",
      passwordHash,
    },
  });

  console.log(`[Auth] Created admin user: ${adminEmail}`);
}

/**
 * Ensure default auth provider configs exist in the database.
 * Credentials is enabled by default, everything else is disabled.
 */
export async function ensureDefaultProviderConfigs(): Promise<void> {
  const defaults = [
    { provider: "credentials", enabled: true },
    { provider: "email", enabled: false },
  ];

  for (const { provider, enabled } of defaults) {
    await prisma.authProviderConfig.upsert({
      where: { provider },
      update: {}, // Don't override if admin has changed it
      create: { provider, enabled },
    });
  }
}

/**
 * Get enabled auth providers from the database
 */
export async function getEnabledProviders(): Promise<string[]> {
  const configs = await prisma.authProviderConfig.findMany({
    where: { enabled: true },
  });
  return configs.map((c) => c.provider);
}

/**
 * Get all auth provider configurations
 */
export async function getAllProviderConfigs() {
  return prisma.authProviderConfig.findMany({
    orderBy: { provider: "asc" },
  });
}

/**
 * Check if a specific provider is enabled
 */
export async function isProviderEnabled(provider: string): Promise<boolean> {
  const config = await prisma.authProviderConfig.findUnique({
    where: { provider },
  });
  // Credentials is always implicitly enabled as the default
  if (provider === "credentials" && !config) return true;
  return config?.enabled ?? false;
}
