import Link from 'next/link';
import { prisma } from '@freelance-os/database';

async function getClients() {
  return await prisma.client.findMany({
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
}

export default async function ClientsPage() {
  const clients = await getClients();

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">Clients</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your client relationships</p>
        </div>
        <Link
          href="/clients/new"
          className="bg-blue-600 dark:bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
        >
          Add Client
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">No clients yet</p>
          <Link
            href="/clients/new"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
          >
            Create your first client
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 hover:shadow-lg dark:hover:shadow-gray-900 transition-shadow p-6 block"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {client.name}
                  </h3>
                  {client.company && (
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{client.company}</p>
                  )}
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">Email:</span> {client.email}
                </p>
                
                <div className="flex gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {client._count.projects}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400 ml-1">
                      {client._count.projects === 1 ? 'project' : 'projects'}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {client._count.invoices}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400 ml-1">
                      {client._count.invoices === 1 ? 'invoice' : 'invoices'}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
