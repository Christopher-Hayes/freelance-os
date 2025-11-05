/**
 * Quick script to check and configure JMAP settings
 * Run with: node --import tsx check-jmap-settings.ts
 */

import { prisma } from './packages/database/src/client.js';

async function main() {
  console.log('Checking JMAP settings...\n');
  
  const settings = await prisma.setting.findFirst({
    where: { key: 'general' }
  });
  
  if (!settings) {
    console.log('❌ No settings record found. Creating one...');
    await prisma.setting.create({
      data: {
        key: 'general',
        value: 'General application settings',
      }
    });
    console.log('✅ Settings record created!\n');
  } else {
    console.log('Settings record found:');
    console.log('  ID:', settings.id);
    console.log('  Key:', settings.key);
    console.log('  JMAP Token:', settings.jmapToken ? '✅ Set' : '❌ Not set');
    console.log('  JMAP Username:', settings.jmapUsername || '❌ Not set');
    console.log('  JMAP Hostname:', settings.jmapHostname || 'api.fastmail.com (default)');
    console.log('  Company Name:', settings.companyName || '❌ Not set');
    console.log('  Freelancer Name:', settings.freelancerName || '❌ Not set');
    console.log('  Freelancer Email:', settings.freelancerEmail || '❌ Not set');
    console.log('\n');
    
    if (!settings.jmapToken || !settings.jmapUsername) {
      console.log('⚠️  JMAP not configured!');
      console.log('\nTo configure JMAP settings, you have two options:\n');
      console.log('1. Use the Admin Dashboard (recommended):');
      console.log('   - Navigate to http://localhost:3000/settings');
      console.log('   - Fill in the JMAP settings form\n');
      console.log('2. Update directly via this script:');
      console.log('   - Edit this file and uncomment the update section below');
      console.log('   - Add your JMAP token and username');
      console.log('   - Run: pnpm tsx check-jmap-settings.ts\n');
    } else {
      console.log('✅ JMAP is properly configured!');
    }
  }
  
  // Uncomment and fill in your values to update settings:
  /*
  await prisma.setting.update({
    where: { key: 'general' },
    data: {
      jmapToken: 'your-jmap-api-token-here',
      jmapUsername: 'your-email@fastmail.com',
      jmapHostname: 'api.fastmail.com',
      companyName: 'Your Company Name',
      freelancerName: 'Your Name',
      freelancerEmail: 'your-email@fastmail.com',
    }
  });
  console.log('✅ Settings updated!');
  */
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
