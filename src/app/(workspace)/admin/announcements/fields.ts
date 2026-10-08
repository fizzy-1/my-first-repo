import type { FieldDef, FormValues } from "@/components/forms/types";
import { toDateTimeInput } from "@/lib/dates";
import { ANNOUNCEMENT_LEVEL, optionsOf } from "@/lib/labels";

export function announcementFields(opts: { isEdit: boolean }): FieldDef[] {
  return [
    { type: "text", name: "title", label: "Title", required: true, span: 2, maxLength: 160, placeholder: "e.g. Office closed on Heritage Day" },
    { type: "select", name: "level", label: "Level", required: true, options: optionsOf(ANNOUNCEMENT_LEVEL), hint: "Important and critical announcements stand out on the dashboard." },
    { type: "datetime", name: "publishedAt", label: "Publish at", hint: "Leave empty to publish immediately." },
    { type: "datetime", name: "expiresAt", label: "Expires at", hint: "Leave empty to keep it up until you take it down." },
    { type: "textarea", name: "body", label: "Message", required: true, rows: 5, maxLength: 4000, placeholder: "What does everyone need to know?" },
    ...(opts.isEdit
      ? []
      : ([
          {
            type: "checkbox",
            name: "notifyEveryone",
            label: "Also notify everyone now",
            description: "Sends an in-app notification to every active user. Only for announcements published immediately.",
            span: 2,
          },
        ] as FieldDef[])),
  ];
}

export function announcementDefaults(a: { title: string; body: string; level: string; publishedAt: Date; expiresAt: Date | null }): FormValues {
  return {
    title: a.title,
    body: a.body,
    level: a.level,
    publishedAt: toDateTimeInput(a.publishedAt),
    expiresAt: toDateTimeInput(a.expiresAt),
  };
}
