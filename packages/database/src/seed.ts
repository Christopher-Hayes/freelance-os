import { prisma } from './client';

async function main() {
  console.log('🌱 Seeding database...');

  // Create sample clients
  const client1 = await prisma.client.upsert({
    where: { email: 'john@acmecorp.com' },
    update: {},
    create: {
      email: 'john@acmecorp.com',
      name: 'John Doe',
      company: 'Acme Corp',
    },
  });

  const client2 = await prisma.client.upsert({
    where: { email: 'sarah@techstartup.io' },
    update: {},
    create: {
      email: 'sarah@techstartup.io',
      name: 'Sarah Johnson',
      company: 'Tech Startup Inc',
    },
  });

  console.log('✅ Created clients:', { client1, client2 });

  // Create sample projects
  const project1 = await prisma.project.create({
    data: {
      name: 'Website Redesign',
      description: 'Complete overhaul of company website',
      clientId: client1.id,
      status: 'active',
      startDate: new Date('2025-10-01'),
    },
  });

  const project2 = await prisma.project.create({
    data: {
      name: 'Mobile App Development',
      description: 'React Native mobile application',
      clientId: client2.id,
      status: 'active',
      startDate: new Date('2025-10-15'),
    },
  });

  console.log('✅ Created projects:', { project1, project2 });

  // Create sample time entries
  const timeEntry1 = await prisma.timeEntry.create({
    data: {
      projectId: project1.id,
      description: 'Initial design mockups',
      startTime: new Date('2025-10-31T09:00:00Z'),
      endTime: new Date('2025-10-31T12:00:00Z'),
      durationMinutes: 180,
      billable: true,
    },
  });

  const timeEntry2 = await prisma.timeEntry.create({
    data: {
      projectId: project2.id,
      description: 'Set up project structure',
      startTime: new Date('2025-10-31T14:00:00Z'),
      endTime: new Date('2025-10-31T17:30:00Z'),
      durationMinutes: 210,
      billable: true,
    },
  });

  console.log('✅ Created time entries:', { timeEntry1, timeEntry2 });

  // Create sample invoices
  const invoice1 = await prisma.invoice.upsert({
    where: { invoiceNumber: 'INV-2025-001' },
    update: {},
    create: {
      invoiceNumber: 'INV-2025-001',
      clientId: client1.id,
      projectId: project1.id,
      amount: 5400.00,
      currency: 'USD',
      status: 'sent',
      issueDate: new Date('2025-10-25'),
      dueDate: new Date('2025-11-25'),
      notes: 'October 2025 - Design work',
    },
  });

  const invoice2 = await prisma.invoice.upsert({
    where: { invoiceNumber: 'INV-2025-002' },
    update: {},
    create: {
      invoiceNumber: 'INV-2025-002',
      clientId: client2.id,
      projectId: project2.id,
      amount: 3200.00,
      currency: 'USD',
      status: 'paid',
      issueDate: new Date('2025-10-20'),
      dueDate: new Date('2025-11-20'),
      paidDate: new Date('2025-10-28'),
      notes: 'Initial development sprint',
    },
  });

  console.log('✅ Created invoices:', { invoice1, invoice2 });

  // Create sample activity sessions for today (Oct 31, 2025)
  const today = new Date('2025-10-31');
  
  const activitySession1 = await prisma.activitySession.create({
    data: {
      startTime: new Date('2025-10-31T08:30:00Z'),
      endTime: new Date('2025-10-31T09:15:00Z'),
      appClass: 'VS Code',
      windowTitle: 'DayTimeline.tsx - freelance-os',
      durationSeconds: 2700, // 45 minutes
    },
  });

  const activitySession2 = await prisma.activitySession.create({
    data: {
      startTime: new Date('2025-10-31T09:20:00Z'),
      endTime: new Date('2025-10-31T10:45:00Z'),
      appClass: 'Chrome',
      windowTitle: 'React Documentation - Google Chrome',
      durationSeconds: 5100, // 85 minutes
    },
  });

  const activitySession3 = await prisma.activitySession.create({
    data: {
      startTime: new Date('2025-10-31T11:00:00Z'),
      endTime: new Date('2025-10-31T12:30:00Z'),
      appClass: 'VS Code',
      windowTitle: 'schema.prisma - freelance-os',
      durationSeconds: 5400, // 90 minutes
    },
  });

  const activitySession4 = await prisma.activitySession.create({
    data: {
      startTime: new Date('2025-10-31T13:30:00Z'),
      endTime: new Date('2025-10-31T15:00:00Z'),
      appClass: 'Slack',
      windowTitle: 'Client Communications',
      durationSeconds: 5400, // 90 minutes
    },
  });

  const activitySession5 = await prisma.activitySession.create({
    data: {
      startTime: new Date('2025-10-31T15:15:00Z'),
      endTime: new Date('2025-10-31T17:00:00Z'),
      appClass: 'Terminal',
      windowTitle: null,
      durationSeconds: 6300, // 105 minutes
    },
  });

  console.log('✅ Created activity sessions:', { 
    activitySession1, 
    activitySession2, 
    activitySession3,
    activitySession4,
    activitySession5
  });

  // Create default settings
  const settings = await prisma.setting.upsert({
    where: { key: 'main' },
    update: {},
    create: {
      key: 'main',
      value: '',
      aiProvider: 'openai',
    },
  });

  console.log('✅ Created default settings:', { settings });

  console.log('🎉 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
