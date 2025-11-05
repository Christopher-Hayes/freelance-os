import { prisma } from '@freelance-os/database';

async function checkApiKey() {
  const key = '162d079aded38b74055835292ab8b551cb51d3c50a13b651e0b55867c3e08ac8';
  
  console.log('Checking for API key:', key);
  
  const apiKey = await prisma.apiKey.findUnique({
    where: { key },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          clientId: true,
        },
      },
      client: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (apiKey) {
    console.log('API key found:');
    console.log(JSON.stringify(apiKey, null, 2));
  } else {
    console.log('API key NOT found in database');
    
    // List all API keys to see what exists
    const allKeys = await prisma.apiKey.findMany({
      select: {
        id: true,
        name: true,
        key: true,
        clientId: true,
        userId: true,
      },
    });
    
    console.log('\nAll API keys in database:');
    console.log(JSON.stringify(allKeys, null, 2));
  }

  await prisma.$disconnect();
}

checkApiKey().catch(console.error);
