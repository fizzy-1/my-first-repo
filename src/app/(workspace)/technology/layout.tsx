import { SubNav } from "@/components/common/sub-nav";
import { canAny, requirePageAccess } from "@/server/auth/current-user";

export default async function TechnologyLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageAccess("technology.read", "technology.read.assigned", "technology.bugs.report");
  const fullAccess = canAny(user, ["technology.read", "technology.read.assigned"]);
  return (
    <>
      <SubNav
        items={[
          ...(fullAccess ? [{ href: "/technology", label: "Product roadmap", exact: true }] : []),
          { href: "/technology/bugs", label: "Bugs" },
          ...(fullAccess ? [{ href: "/technology/tasks", label: "Development tasks" }] : []),
        ]}
      />
      {children}
    </>
  );
}
