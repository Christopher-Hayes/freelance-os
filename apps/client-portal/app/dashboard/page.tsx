import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect("/auth/signin");
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Client Portal
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {session.user.email}
              </span>
              <form action={async () => {
                "use server";
                await signOut({ redirectTo: "/auth/signin" });
              }}>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-4 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Welcome to your Client Portal
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              You're successfully signed in!
            </p>
            {session.user.clientId ? (
              <p className="text-sm text-gray-500 dark:text-gray-500">
                Client ID: {session.user.clientId}
              </p>
            ) : (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Your account is not yet linked to a client. Please contact an administrator.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
