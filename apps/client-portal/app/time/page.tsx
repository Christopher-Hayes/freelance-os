import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TimeTrackingContent } from "./TimeTrackingContent";

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
      <TimeTrackingContent />
    </DashboardLayout>
  );
}
