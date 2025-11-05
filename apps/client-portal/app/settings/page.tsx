import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { SettingsContent } from "./SettingsContent";

export default async function SettingsPage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect("/auth/signin");
  }

  return (
    <DashboardLayout>
      <SettingsContent 
        userName={session.user.name || "Not set"}
        userEmail={session.user.email || ""}
      />
    </DashboardLayout>
  );
}
