import { redirect } from "next/navigation";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { ADMIN_PERMISSIONS, ADMIN_SECTIONS } from "./sections";

/** /admin has no page of its own: open the first section this person may use. */
export default async function AdminPage() {
  const user = await requirePageAccess(...ADMIN_PERMISSIONS);
  const first = ADMIN_SECTIONS.find((s) => can(user, s.permission));
  redirect(first ? first.href : "/access-denied");
}
