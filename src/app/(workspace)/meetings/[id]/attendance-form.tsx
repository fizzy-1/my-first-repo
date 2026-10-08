"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { setAttendanceAction } from "@/server/actions/meetings";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

/** Tick who was present; Radix checkboxes submit as `attended=<userId>` form values. */
export function AttendanceForm({ meetingId, attendees }: { meetingId: string; attendees: { id: string; name: string; attended: boolean | null }[] }) {
  const [state, formAction, pending] = React.useActionState(setAttendanceAction, null);
  const lastHandled = React.useRef<typeof state>(null);
  React.useEffect(() => {
    if (!state || state === lastHandled.current) return;
    lastHandled.current = state;
    if (state.ok) toast.success(state.message ?? "Saved");
    else toast.error(state.message ?? "Couldn't save attendance");
  }, [state]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={meetingId} />
      <ul className="space-y-1.5">
        {attendees.map((a) => (
          <li key={a.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent">
              <Checkbox name="attended" value={a.id} defaultChecked={a.attended ?? true} aria-label={`${a.name} attended`} />
              <Avatar name={a.name} size="xs" />
              <span className="text-sm">{a.name}</span>
            </label>
          </li>
        ))}
      </ul>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Save attendance
      </Button>
    </form>
  );
}
