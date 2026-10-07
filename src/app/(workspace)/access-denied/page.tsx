import Link from "next/link";
import { ShieldAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/current-user";

export const metadata = { title: "Access denied" };

export default async function AccessDeniedPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <ShieldAlertIcon className="size-6" />
      </div>
      <h1 className="text-xl font-semibold">You don&apos;t have access to that area</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your role (<span className="font-medium text-foreground">{user.roleName}</span>) doesn&apos;t include permission for the page you
        tried to open. If you need access, ask a director or the workspace administrator.
      </p>
      <Button asChild className="mt-6">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
