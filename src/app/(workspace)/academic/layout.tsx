import { SubNav } from "@/components/common/sub-nav";
import { requirePageAccess } from "@/server/auth/current-user";

export default async function AcademicLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess("academic.read", "academic.read.assigned");
  return (
    <>
      <SubNav
        items={[
          { href: "/academic", label: "Content pipeline", exact: true },
          { href: "/academic/courses", label: "Courses & topics" },
          { href: "/academic/tutors", label: "Tutors" },
          { href: "/academic/hours", label: "Tutor hours" },
        ]}
      />
      {children}
    </>
  );
}
