"use client";

import * as React from "react";
import Link from "next/link";
import {
  BanIcon,
  CheckIcon,
  CopyIcon,
  HistoryIcon,
  KeyRoundIcon,
  LockOpenIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  PencilIcon,
  ShieldAlertIcon,
  UserCheckIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { UserStatus } from "@prisma/client";
import {
  createUserAction,
  resetUserPasswordAction,
  revokeUserSessionsAction,
  setUserStatusAction,
  unlockUserAction,
  updateUserAction,
  type IssuedPasswordState,
} from "@/server/actions/admin";
import type { ActionState } from "@/server/action";
import { ConfirmContent } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { newUserDefaults, userDefaults, userFields, type UserFormOptions } from "./fields";

type Issued = NonNullable<NonNullable<IssuedPasswordState>["issued"]>;

/**
 * Shows a freshly issued temporary password exactly once. Nothing is kept after
 * the dialog closes; outside clicks are ignored so it isn't dismissed by accident.
 */
function TemporaryPasswordDialog({ issued, onClose }: { issued: Issued | null; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.password);
      setCopied(true);
      toast.success("Password copied");
    } catch {
      toast.error("Couldn't access the clipboard. Select the password and copy it manually.");
    }
  };

  return (
    <Dialog
      open={issued !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent size="sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Temporary password for {issued?.name}</DialogTitle>
          <DialogDescription>Share it privately. It is shown only this once and can&apos;t be retrieved later.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2 pl-3">
            <code className="min-w-0 flex-1 font-mono text-base tracking-wide break-all select-all" data-testid="temporary-password">
              {issued?.password}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={copy} aria-label="Copy password">
              {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <ul className="space-y-1.5 text-[13px] text-muted-foreground">
            <li>
              Sign-in email: <span className="font-medium text-foreground">{issued?.email}</span>
            </li>
            <li>They&apos;ll be asked to choose their own password straight after signing in.</li>
            <li>If it&apos;s lost, use “Reset password” to issue a new one.</li>
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              setCopied(false);
              onClose();
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreateUserButton({ options }: { options: UserFormOptions }) {
  const [issued, setIssued] = React.useState<Issued | null>(null);
  return (
    <>
      <FormDialog
        title="Add a user"
        description="They get a temporary password and must choose their own the first time they sign in."
        size="lg"
        trigger={
          <Button>
            <UserPlusIcon /> Add user
          </Button>
        }
        openParam="user"
        action={createUserAction}
        fields={userFields(options)}
        defaultValues={newUserDefaults}
        submitLabel="Create account"
        onSuccess={(state) => setIssued((state as IssuedPasswordState)?.issued ?? null)}
      />
      <TemporaryPasswordDialog issued={issued} onClose={() => setIssued(null)} />
    </>
  );
}

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  roleKey: string;
  departmentId: string | null;
  jobTitle: string | null;
  managerId: string | null;
  manager: { id: string; name: string } | null;
  employmentType: string;
  locked: boolean;
  activeSessions: number;
}

interface Confirmation {
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
  run: () => Promise<ActionState>;
  onSuccess?: (state: NonNullable<ActionState>) => void;
}

/** Per-row administration menu: edit, password reset, unlock, sessions and status changes. */
export function UserRowActions({
  user,
  isSelf,
  canAudit,
  options,
}: {
  user: ManagedUser;
  isSelf: boolean;
  canAudit: boolean;
  options: UserFormOptions;
}) {
  const [pending, startTransition] = React.useTransition();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState<Confirmation | null>(null);
  const [issued, setIssued] = React.useState<Issued | null>(null);

  const execute = (action: () => Promise<ActionState>, onSuccess?: (state: NonNullable<ActionState>) => void) =>
    startTransition(async () => {
      const state = await action();
      if (state?.ok) {
        if (state.message) toast.success(state.message);
        onSuccess?.(state);
      } else {
        toast.error(state?.message ?? "Something went wrong.");
      }
    });

  // Managers offered when editing: everyone active except the person, keeping a current manager who has since left.
  const currentManager = user.manager;
  const managers = options.managers.filter((m) => m.value !== user.id);
  if (currentManager && !managers.some((m) => m.value === currentManager.id)) {
    managers.unshift({ value: currentManager.id, label: `${currentManager.name} (inactive)` });
  }
  const first = user.name.split(" ")[0];
  const setStatus = (status: "ACTIVE" | "SUSPENDED" | "OFFBOARDED") => () => setUserStatusAction({ id: user.id, status });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.name}`} disabled={pending}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <PencilIcon /> Edit details
          </DropdownMenuItem>
          {!isSelf && (
            <DropdownMenuItem
              onSelect={() =>
                setConfirming({
                  title: `Reset ${user.name}'s password?`,
                  description: `${first} will be signed out everywhere and must sign in with a new temporary password, which you'll see once.`,
                  confirmLabel: "Reset password",
                  destructive: true,
                  run: () => resetUserPasswordAction({ id: user.id }),
                  onSuccess: (state) => setIssued((state as IssuedPasswordState)?.issued ?? null),
                })
              }
            >
              <KeyRoundIcon /> Reset password
            </DropdownMenuItem>
          )}
          {user.locked && (
            <DropdownMenuItem onSelect={() => execute(() => unlockUserAction({ id: user.id }))}>
              <LockOpenIcon /> Unlock account
            </DropdownMenuItem>
          )}
          {!isSelf && user.activeSessions > 0 && (
            <DropdownMenuItem
              onSelect={() =>
                setConfirming({
                  title: `Sign ${user.name} out everywhere?`,
                  description: `Ends ${user.activeSessions} active session${user.activeSessions === 1 ? "" : "s"}. ${first} can sign in again straight away.`,
                  confirmLabel: "Sign out",
                  destructive: false,
                  run: () => revokeUserSessionsAction({ id: user.id }),
                })
              }
            >
              <LogOutIcon /> Sign out all sessions
            </DropdownMenuItem>
          )}
          {canAudit && (
            <DropdownMenuItem asChild>
              <Link href={`/admin/audit?entityType=User&entityId=${encodeURIComponent(user.id)}`}>
                <HistoryIcon /> View audit history
              </Link>
            </DropdownMenuItem>
          )}
          {!isSelf && (
            <>
              <DropdownMenuSeparator />
              {user.status !== "ACTIVE" && (
                <DropdownMenuItem
                  onSelect={() =>
                    setConfirming({
                      title: `Reactivate ${user.name}?`,
                      description: `${first} will be able to sign in again with their existing password and role.`,
                      confirmLabel: "Reactivate",
                      destructive: false,
                      run: setStatus("ACTIVE"),
                    })
                  }
                >
                  <UserCheckIcon /> Reactivate
                </DropdownMenuItem>
              )}
              {(user.status === "ACTIVE" || user.status === "INVITED") && (
                <DropdownMenuItem
                  destructive
                  onSelect={() =>
                    setConfirming({
                      title: `Suspend ${user.name}?`,
                      description: `${first} is signed out everywhere immediately and can't sign in until reactivated. Their records stay as they are.`,
                      confirmLabel: "Suspend",
                      destructive: true,
                      run: setStatus("SUSPENDED"),
                    })
                  }
                >
                  <BanIcon /> Suspend
                </DropdownMenuItem>
              )}
              {user.status !== "OFFBOARDED" && (
                <DropdownMenuItem
                  destructive
                  onSelect={() =>
                    setConfirming({
                      title: `Offboard ${user.name}?`,
                      description: `Use this when someone leaves. ${first} is signed out everywhere and can't sign in; their history, tasks and documents are kept for reassignment.`,
                      confirmLabel: "Offboard",
                      destructive: true,
                      run: setStatus("OFFBOARDED"),
                    })
                  }
                >
                  <UserMinusIcon /> Offboard
                </DropdownMenuItem>
              )}
            </>
          )}
          {isSelf && (
            <p className="flex items-start gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
              <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" /> Manage your own password and sessions on your profile.
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <FormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`Edit ${user.name}`}
        size="lg"
        action={updateUserAction}
        fields={[{ type: "hidden", name: "id", value: user.id }, ...userFields({ ...options, managers }, { isSelf })]}
        defaultValues={userDefaults(user)}
        submitLabel="Save changes"
      />
      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        {confirming && (
          <ConfirmContent
            title={confirming.title}
            description={confirming.description}
            confirmLabel={confirming.confirmLabel}
            destructive={confirming.destructive}
            onConfirm={() => execute(confirming.run, confirming.onSuccess)}
          />
        )}
      </AlertDialog>
      <TemporaryPasswordDialog issued={issued} onClose={() => setIssued(null)} />
    </>
  );
}
