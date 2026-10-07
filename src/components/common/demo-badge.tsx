import { FlaskConicalIcon } from "lucide-react";

export function DemoBadge() {
  if (process.env.DEMO_MODE !== "true") return null;
  return (
    <span
      className="hidden items-center gap-1 rounded-md border border-warning/40 bg-warning-soft px-2 py-1 text-[11px] font-medium text-warning md:inline-flex"
      title="This workspace contains seeded demo data (ids prefixed demo_). Remove with `npm run demo:remove`."
    >
      <FlaskConicalIcon className="size-3" /> Demo data
    </span>
  );
}
