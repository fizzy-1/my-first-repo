/**
 * Serializable form field definitions. Server components build these (with
 * options loaded from the database) and pass them to the client form renderer.
 */
export interface FieldOption {
  value: string;
  label: string;
  hint?: string;
}

interface BaseField {
  name: string;
  label: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  /** Grid columns spanned in the two-column form layout (default 1; textareas default 2). */
  span?: 1 | 2;
  disabled?: boolean;
}

export type FieldDef =
  | (BaseField & { type: "text" | "email" | "url" | "password" | "tel"; maxLength?: number; autoComplete?: string })
  | (BaseField & { type: "number"; min?: number; max?: number; step?: number })
  | (BaseField & { type: "money" })
  | (BaseField & { type: "percent" })
  | (BaseField & { type: "date" | "datetime" })
  | (BaseField & { type: "textarea"; rows?: number; maxLength?: number })
  | (BaseField & { type: "select"; options: FieldOption[]; emptyLabel?: string })
  | (BaseField & { type: "multiselect"; options: FieldOption[] })
  | (BaseField & { type: "checkbox"; description?: string })
  | (BaseField & { type: "file"; accept?: string })
  | { type: "hidden"; name: string; value: string }
  | { type: "heading"; name: string; label: string; description?: string };

export type FieldValue = string | string[] | boolean | number | null | undefined;
export type FormValues = Record<string, FieldValue>;
