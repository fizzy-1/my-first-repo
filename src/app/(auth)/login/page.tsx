import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { LockKeyholeIcon, ShieldCheckIcon } from "lucide-react";
import logo from "@/assets/brand/integral-academy-logo.png";
import { LogoMark } from "@/components/shell/logo";
import { getCurrentUser } from "@/server/auth/current-user";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const HIGHLIGHTS = ["Live KPIs & business intelligence", "Approvals with a full audit trail", "Finance, schools & marketing", "Academic & product operations"];

export default async function LoginPage(props: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/dashboard");
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel: the crest on paper, as it appears in print. Fixed light colours in both themes. */}
      <section className="relative hidden overflow-hidden bg-paper p-12 text-[#0b2545] lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(55% 45% at 50% 32%, rgba(201,163,90,0.16), transparent 70%), radial-gradient(70% 50% at 50% 110%, rgba(11,37,69,0.10), transparent 70%)",
          }}
        />
        <div aria-hidden className="absolute inset-x-12 top-8 h-px bg-gradient-to-r from-transparent via-[#c9a35a]/60 to-transparent" />
        <div className="relative flex flex-1 flex-col items-center justify-center text-center">
          <Image src={logo} alt="Integral Academy — Summing knowledge. Shaping futures." priority sizes="320px" className="h-auto w-[min(320px,60%)]" />
          <div className="mt-10 max-w-md">
            <p className="font-display text-sm font-bold tracking-[0.2em] text-[#8a6420]">EXECUTIVE WORKSPACE</p>
            <h1 className="mt-3 text-[28px] leading-snug font-semibold tracking-tight text-balance">What does management need to know and act on today?</h1>
            <p className="mt-3 text-[15px] text-[#3d4b63]">
              Revenue, learners, schools, content, product and people. One private operating system for the leadership of Integral Academy.
            </p>
          </div>
          <ul className="mt-8 grid max-w-md grid-cols-2 gap-x-6 gap-y-2.5 text-left text-sm text-[#22324a]">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span aria-hidden className="size-1.5 shrink-0 rotate-45 bg-[#c9a35a]" /> {item}
              </li>
            ))}
          </ul>
        </div>
        <div aria-hidden className="absolute inset-x-12 bottom-16 h-px bg-gradient-to-r from-transparent via-[#c9a35a]/60 to-transparent" />
        <p className="relative mt-8 text-center text-xs text-[#5b6679]">© {new Date().getFullYear()} Integral Academy (Pty) Ltd · Internal use only</p>
      </section>

      <section className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex flex-col items-center gap-3 text-center lg:hidden">
            <LogoMark className="size-20 rounded-2xl" />
            <div className="leading-tight">
              <p className="font-display text-lg font-bold tracking-[0.06em]">INTEGRAL ACADEMY</p>
              <p className="mt-0.5 text-xs tracking-wide text-muted-foreground">Summing knowledge. Shaping futures.</p>
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
