/**
 * Email utility functions for admin dashboard
 */
import { prisma } from '@freelance-os/database';
import type { JMAPConfig } from '@freelance-os/email';

/**
 * Fetch JMAP configuration from database settings
 * Falls back to environment variables if database settings are not configured
 * @throws Error if JMAP is not configured in database or environment
 */
export async function getJMAPConfig(): Promise<JMAPConfig> {
  // Try to get settings from database
  const setting = await prisma.setting.findUnique({
    where: { key: 'main' },
  });

  // Check if JMAP is configured in database
  if (setting?.jmapToken && setting?.jmapUsername) {
    return {
      token: setting.jmapToken,
      username: setting.jmapUsername,
      hostname: setting.jmapHostname || 'api.fastmail.com',
    };
  }

  // Fall back to environment variables (for backward compatibility)
  const token = process.env.JMAP_TOKEN;
  const username = process.env.JMAP_USERNAME;
  const hostname = process.env.JMAP_HOSTNAME;

  if (token && username) {
    return {
      token,
      username,
      hostname: hostname || 'api.fastmail.com',
    };
  }

  throw new Error(
    'JMAP email service is not configured. Please configure email settings in Settings page or set JMAP environment variables.'
  );
}

/**
 * Get company name from database settings
 * Falls back to environment variable if not configured in database
 */
export async function getCompanyName(): Promise<string> {
  const setting = await prisma.setting.findUnique({
    where: { key: 'main' },
  });

  return setting?.companyName || process.env.COMPANY_NAME || 'Freelance-OS';
}
