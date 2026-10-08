import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, BellIcon, KeyRoundIcon, LayoutGridIcon, LogOutIcon, MonitorIcon, ShieldAlertIcon, SmartphoneIcon } from "lucide-react";
import type { EmploymentType } from "@prisma/client";
import { changePasswordAction, revokeSessionAction, signOutOtherSessionsAction } from "@/server/actions/auth";
import { requireUser } from "@/server/auth/current-user";
import { getMyAccount, listMySessions } from "@/server/services/admin";
import { SectionCard } from "@/components/common/section-card";
import { PageHeader } from "@/components/common/page-header";
import { ActionButton, ConfirmActionButton } from "@/components/forms/action-button";
import { EntityForm } from "@/components/forms/entity-form";
import type { FieldDef } from "@/components/forms/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EMPLOYMENT_TYPE } from "@/lib/labels";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { first } from "@/lib/list-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile & security" };

const SESSIONS_SHOWN = 10;

function passwordFields(setup: boolean): FieldDef[] {
  return [
    {
      type: "password",
      name: "currentPassword",
      label: setup ? "Temporary password" : "Current password",
      required: true,
      span: 2,
      autoComplete: "current-password",
    },
    {
      type: "password",
      name: "newPassword",
      label: "New password",
      required: true,
      span: 2,
      autoComplete: "new-password",
      hint: "At least 12 characters, with upper- and lowercase letters, a number and a symbol.",
    },
    { type: "password", name: "confirmPassword", label: "Confirm new password", required: true, span: 2, autoComplete: "new-password" },
  ];
}

/** A short, human description of a session's user agent ("Chrome on Windows"). */
function describeDevice(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: "Unknown device", mobile: false };
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\/|FxiOS/.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS/.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  return { label: os ? `${browser} on ${os}` : browser, mobile: /Mobi|iPhone|Android/.test(ua) };
}

export default async function ProfilePage(props: PageProps<"/profile">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const [account, sessions] = await Promise.all([getMyAccount(user), listMySessions(user)]);
  const setup = account.mustChangePassword || first(sp.setup) === "1";
  const now = new Date();
  const ordered = [...sessions].sort((a, b) => Number(b.current) - Number(a.current));
  const others = sessions.filter((s) => !s.current).length;

  const details: { label: string; value: React.ReactNode }[] = [
    { label: "Email", value: account.email },
    {
      label: "Role",
      value: (
        <>
          {account.role.name}
          <span className="block text-xs text-muted-foreground">{account.role.description}</span>
        </>
      ),
    },
    { label: "Department", value: account.department?.name ?? "—" },
    { label: "Job title", value: account.jobTitle ?? "—" },
    {
      label: "Manager",
      value: account.manager ? (
        <>
          {account.manager.name}
          {account.manager.jobTitle && <span className="block text-xs text-muted-foreground">{account.manager.jobTitle}</span>}
        </>
      ) : (
        "—"
      ),
    },
    { label: "Employment", value: EMPLOYMENT_TYPE[account.employmentType as EmploymentType]?.label ?? account.employmentType },
    { label: account.startDate ? "Started" : "Member since", value: formatDate(account.startDate ?? account.createdAt) },
    { label: "Last sign-in", value: account.lastLoginAt ? formatDateTime(account.lastLoginAt) : "—" },
    { label: "Password changed", value: account.passwordChangedAt ? formatDateTime(account.passwordChangedAt) : "Not since the account was created" },
  ];

  const passwordCard = (
    <SectionCard
      title={setup ? "Choose your password" : "Change password"}
      description={
        setup
          ? "Enter the temporary password you were given, then choose your own."
          : "Changing your password keeps you signed in here and signs out every other device."
      }
      className={cn(setup && "ring-2 ring-primary/40")}
    >
      <EntityForm
        action={changePasswordAction}
        fields={passwordFields(setup)}
        submitLabel={setup ? "Set password and continue" : "Update password"}
        successHref={setup ? "/dashboard" : undefined}
        resetOnSuccess
      />
    </SectionCard>
  );

  return (
    <>
      <PageHeader
        title="Profile & security"
        description="Your account details, password and the devices you're signed in on."
        meta={
          <span className="inline-flex items-center gap-2 text-sm">
            <Avatar name={account.name} size="sm" />
            <span className="font-medium">{account.name}</span>
            <Badge tone="primary">{account.role.name}</Badge>
          </span>
        }
      />

      {setup && (
        <Card className="mb-6 flex flex-col gap-3 border-warning/40 bg-warning-soft p-5 sm:flex-row sm:items-start" role="status">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card text-warning">
            <ShieldAlertIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Set a new password to continue</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {account.mustChangePassword
                ? "You signed in with a temporary password from an administrator. Choose your own password below to unlock the rest of the workspace."
                : "Choose a password only you know. Once it's set you can carry on to your dashboard."}
            </p>
          </div>
          {!account.mustChangePassword && (
            <Button variant="outline" asChild className="shrink-0">
              <Link href="/dashboard">
                Continue to dashboard <ArrowRightIcon />
              </Link>
            </Button>
          )}
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="min-w-0 space-y-6">
          {setup && passwordCard}

          <SectionCard title="Your details" description="Managed by your administrator. Ask them if anything here is out of date.">
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {details.map((d) => (
                <div key={d.label} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{d.label}</dt>
                  <dd className="mt-0.5 text-sm break-words">{d.value}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>

          <SectionCard
            title="Signed-in devices"
            description="Sessions expire after a period of inactivity. Sign out anything you don't recognise."
            actions={
              <ConfirmActionButton
                variant="outline"
                size="sm"
                action={signOutOtherSessionsAction}
                input={{}}
                title="Sign out of all other sessions?"
                description="Every other browser and device signed in to your account will be signed out. This one stays signed in."
                confirmLabel="Sign out others"
                destructive={false}
                disabled={others === 0}
              >
                <LogOutIcon /> <span className="hidden sm:inline">Sign out other sessions</span>
                <span className="sm:hidden">Sign out others</span>
              </ConfirmActionButton>
            }
            flush
          >
            <ul className="divide-y divide-border border-t border-border">
              {ordered.slice(0, SESSIONS_SHOWN).map((s) => {
                const device = describeDevice(s.userAgent);
                const Icon = device.mobile ? SmartphoneIcon : MonitorIcon;
                return (
                  <li key={s.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium" title={s.userAgent ?? undefined}>
                          {device.label}
                          {s.current && <Badge tone="success">This device</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Signed in {formatDateTime(s.createdAt)} · {s.current ? "active now" : `last active ${formatRelative(s.lastSeenAt, now)}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.ipAddress ? `IP ${s.ipAddress} · ` : ""}Expires {formatDate(s.expiresAt)}
                        </p>
                      </div>
                    </div>
                    {!s.current && (
                      <ActionButton variant="ghost" size="sm" action={revokeSessionAction} input={{ sessionId: s.id }} className="self-start sm:self-auto">
                        Sign out
                      </ActionButton>
                    )}
                  </li>
                );
              })}
            </ul>
            {ordered.length > SESSIONS_SHOWN && (
              <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
                {ordered.length - SESSIONS_SHOWN} older sessions aren&apos;t listed. “Sign out other sessions” ends them all.
              </p>
            )}
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-6">
          {!setup && passwordCard}
          {!account.mustChangePassword && (
            <SectionCard title="Preferences" flush>
              <ul className="divide-y divide-border border-t border-border">
                {[
                  { href: "/notifications", icon: BellIcon, title: "Notifications", body: "Assignments, approvals, deadlines and announcements sent to you." },
                  { href: "/dashboard", icon: LayoutGridIcon, title: "Customise your dashboard", body: "Use “Customise” on the dashboard to reorder or hide widgets." },
                ].map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-accent/50">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                        <item.icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{item.title}</span>
                        <span className="block text-xs text-muted-foreground">{item.body}</span>
                      </span>
                      <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          <Card className="flex items-start gap-3 p-4 text-xs text-muted-foreground">
            <KeyRoundIcon className="mt-0.5 size-4 shrink-0" />
            <p>
              Passwords are stored as one-way hashes. Five wrong attempts lock sign-in for 15 minutes; an administrator can unlock
              your account or issue a temporary password if you&apos;re locked out.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
