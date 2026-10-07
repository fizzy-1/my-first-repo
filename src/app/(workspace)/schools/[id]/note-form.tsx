"use client";

import { addSchoolNoteAction } from "@/server/actions/schools";
import { EntityForm } from "@/components/forms/entity-form";

export function NoteForm({ schoolId }: { schoolId: string }) {
  return (
    <EntityForm
      action={addSchoolNoteAction}
      resetOnSuccess
      submitLabel="Add note"
      fields={[
        { type: "hidden", name: "schoolId", value: schoolId },
        { type: "textarea", name: "body", label: "New note", rows: 3, placeholder: "Meeting outcome, objections, next steps…" },
      ]}
    />
  );
}
