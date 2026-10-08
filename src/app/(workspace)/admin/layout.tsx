import { SubNav } from "@/components/common/sub-nav";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { ADMIN_PERMISSIONS, ADMIN_SECTIONS } from "./sections";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageAccess(...ADMIN_PERMISSIONS);
  return (
    <>
      <SubNav items={ADMIN_SECTIONS.filter((s) => can(user, s.permission)).map(({ href, label }) => ({ href, label }))} />
      {children}
    </>
  );
}
