import { SubNav } from "@/components/common/sub-nav";
import { requirePageAccess } from "@/server/auth/current-user";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess("finance.read");
  return (
    <>
      <SubNav
        items={[
          { href: "/finance", label: "Overview", exact: true },
          { href: "/finance/income", label: "Income" },
          { href: "/finance/expenses", label: "Expenses" },
          { href: "/finance/cash-flow", label: "Cash flow" },
          { href: "/finance/budgets", label: "Budgets" },
          { href: "/finance/projections", label: "Projections" },
        ]}
      />
      {children}
    </>
  );
}
