import { cookies } from "next/headers";
import { AppShell } from "@/components/shell/app-shell";
import { DemoBadge } from "@/components/common/demo-badge";
import { requireUser } from "@/server/auth/current-user";
import { getShellData } from "@/server/services/shell";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [{ notifications, counts }, cookieStore] = await Promise.all([getShellData(user), cookies()]);
  return (
    <AppShell
      user={{ name: user.name, email: user.email, roleName: user.roleName, jobTitle: user.jobTitle }}
      permissions={[...user.permissions]}
      counts={counts}
      notifications={notifications}
      sidebarCollapsed={cookieStore.get("ia_sidebar")?.value === "collapsed"}
      demoBadge={<DemoBadge />}
    >
      {children}
    </AppShell>
  );
}
