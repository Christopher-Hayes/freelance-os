import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";

export default async function TimePage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect("/auth/signin");
  }

  if (!session.user.clientId) {
    redirect("/dashboard");
  }

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          Time Tracking
        </h1>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            Time tracking view coming soon in Phase 10
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
