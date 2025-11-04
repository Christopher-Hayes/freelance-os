import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { InvoiceDetailsContent } from "./InvoiceDetailsContent";

export default async function InvoiceDetailPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  if (!session.user.clientId) {
    redirect("/dashboard");
  }

  return (
    <DashboardLayout>
      <InvoiceDetailsContent />
    </DashboardLayout>
  );
}
