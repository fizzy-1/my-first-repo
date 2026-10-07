import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LockKeyholeIcon, ShieldCheckIcon } from "lucide-react";
import { LogoMark } from "@/components/shell/logo";
import { getCurrentUser } from "@/server/auth/current-user";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/dashboard");
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#161626] p-12 text-white lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(60% 50% at 20% 10%, rgba(76,81,191,0.55), transparent 70%), radial-gradient(50% 50% at 90% 90%, rgba(107,70,193,0.45), transparent 70%)",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute -right-24 bottom-10 text-[420px] leading-none font-light text-white/[0.04] select-none">
          ∫
        </div>
        <div className="relative flex items-center gap-3">
          <LogoMark className="size-10" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-[0.14em]">INTEGRAL ACADEMY</p>
            <p className="text-xs text-white/60">Executive Workspace</p>
          </div>
        </div>
        <div className="relative mt-auto max-w-lg">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance">
            What does management need to know and act on today?
          </h1>
          <p className="mt-4 text-base text-white/70">
            Revenue, learners, schools, content, product and people — one private operating system for the leadership of
            Integral Academy.
          </p>
          <ul className="mt-8 grid grid-cols-2 gap-3 text-sm text-white/80">
            {["Live KPIs & business intelligence", "Approvals with a full audit trail", "Finance, schools & marketing", "Academic & product operations"].map(
              (item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-[#9ea3ff]" /> {item}
                </li>
              ),
            )}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-white/40">© {new Date().getFullYear()} Integral Academy (Pty) Ltd · Internal use only</p>
      </section>

      <section className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark className="size-10" />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-[0.14em]">INTEGRAL ACADEMY</p>
              <p className="text-xs text-muted-foreground">Executive Workspace</p>
            </div>
          </div>
          <div className="mb-6">
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
              <LockKeyholeIcon className="size-5" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">Restricted to Integral Academy management and staff.</p>
          </div>
          <LoginForm next={next} />
          <p className="mt-8 flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" />
            Sign-ins are rate-limited and recorded in the audit log. Never share your credentials.
          </p>
        </div>
      </section>
    </div>
  );
}
