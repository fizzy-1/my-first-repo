"use client";

import * as React from "react";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FieldDef, FieldOption, FieldValue } from "./types";

const NONE = "__none__";

export function FieldShell({
  id,
  label,
  required,
  hint,
  errors,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  errors?: string[];
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
      </Label>
      {children}
      {errors?.length ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {errors[0]}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function asString(value: FieldValue): string {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  if (Array.isArray(value)) return value[0] ?? "";
  return String(value);
}

function asArray(value: FieldValue): string[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return [];
  return [String(value)];
}

export function SelectField({
  name,
  id,
  options,
  defaultValue,
  emptyLabel,
  required,
  disabled,
  invalid,
  placeholder,
}: {
  name: string;
  id: string;
  options: FieldOption[];
  defaultValue?: string;
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = React.useState(defaultValue && defaultValue !== "" ? defaultValue : emptyLabel ? NONE : "");
  return (
    <>
      <input type="hidden" name={name} value={value === NONE ? "" : value} />
      <Select value={value || undefined} onValueChange={setValue} disabled={disabled} required={required}>
        <SelectTrigger id={id} aria-invalid={invalid || undefined}>
          <SelectValue placeholder={placeholder ?? "Select…"} />
        </SelectTrigger>
        <SelectContent>
          {emptyLabel && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

export function MultiSelectField({
  name,
  id,
  options,
  defaultValue,
  disabled,
  placeholder,
}: {
  name: string;
  id: string;
  options: FieldOption[];
  defaultValue: string[];
  disabled?: boolean;
  placeholder?: string;
}) {
  const [selected, setSelected] = React.useState<string[]>(defaultValue);
  const [query, setQuery] = React.useState("");
  const labels = new Map(options.map((o) => [o.value, o.label]));
  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));
  const toggle = (value: string) =>
    setSelected((current) => (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]));

  return (
    <>
      {selected.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      <Popover>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            id={id}
            type="button"
            className="flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 py-1.5 text-left text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <span className="flex flex-wrap gap-1">
              {selected.length === 0 && <span className="text-muted-foreground/80">{placeholder ?? "Select…"}</span>}
              {selected.map((value) => (
                <span key={value} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs">
                  {labels.get(value) ?? value}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${labels.get(value) ?? value}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(value);
                    }}
                    className="rounded-sm text-muted-foreground hover:text-foreground"
                  >
                    <XIcon className="size-3" />
                  </span>
                </span>
              ))}
            </span>
            <ChevronDownIcon className="size-4 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="mb-1 h-8 w-full rounded-md border-0 bg-muted px-2 text-sm outline-none"
          />
          <div className="max-h-60 overflow-y-auto" role="listbox" aria-multiselectable>
            {filtered.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches</p>}
            {filtered.map((option) => {
              const isSelected = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggle(option.value)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-[5px] border border-input",
                      isSelected && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {isSelected && <CheckIcon className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="flex-1">{option.label}</span>
                  {option.hint && <span className="text-xs text-muted-foreground">{option.hint}</span>}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

/** Renders one field definition. `formId` keeps ids unique when several forms share a page. */
export function Field({
  field,
  value,
  errors,
  formId,
}: {
  field: FieldDef;
  value: FieldValue;
  errors?: string[];
  formId: string;
}) {
  if (field.type === "hidden") return <input type="hidden" name={field.name} value={field.value} />;
  if (field.type === "heading") {
    return (
      <div className="col-span-full mt-2 border-t border-border pt-4 first:mt-0 first:border-0 first:pt-0">
        <p className="text-sm font-semibold">{field.label}</p>
        {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
      </div>
    );
  }

  const id = `${formId}-${field.name}`;
  const invalid = Boolean(errors?.length);
  const span = field.span ?? (field.type === "textarea" || field.type === "multiselect" ? 2 : 1);
  const describedBy = invalid ? `${id}-error` : undefined;

  let control: React.ReactNode;
  switch (field.type) {
    case "textarea":
      control = (
        <Textarea
          id={id}
          name={field.name}
          rows={field.rows ?? 4}
          maxLength={field.maxLength}
          defaultValue={asString(value)}
          placeholder={field.placeholder}
          required={field.required}
          disabled={field.disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      );
      break;
    case "select":
      control = (
        <SelectField
          id={id}
          name={field.name}
          options={field.options}
          defaultValue={asString(value)}
          emptyLabel={field.emptyLabel}
          required={field.required}
          disabled={field.disabled}
          invalid={invalid}
          placeholder={field.placeholder}
        />
      );
      break;
    case "multiselect":
      control = (
        <MultiSelectField
          id={id}
          name={field.name}
          options={field.options}
          defaultValue={asArray(value)}
          disabled={field.disabled}
          placeholder={field.placeholder}
        />
      );
      break;
    case "checkbox":
      return (
        <label htmlFor={id} className={cn("flex items-start gap-3 rounded-lg border border-border p-3", span === 2 && "col-span-full")}>
          <Checkbox id={id} name={field.name} defaultChecked={value === true || value === "on" || value === "true"} disabled={field.disabled} />
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium leading-none">{field.label}</span>
            {field.description && <span className="text-xs text-muted-foreground">{field.description}</span>}
          </span>
        </label>
      );
    case "money":
      control = (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">R</span>
          <Input
            id={id}
            name={field.name}
            inputMode="decimal"
            defaultValue={asString(value)}
            placeholder={field.placeholder ?? "0.00"}
            required={field.required}
            disabled={field.disabled}
            className="tabular pl-7"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
        </div>
      );
      break;
    case "percent":
      control = (
        <div className="relative">
          <Input
            id={id}
            name={field.name}
            inputMode="decimal"
            defaultValue={asString(value)}
            placeholder={field.placeholder ?? "0"}
            required={field.required}
            disabled={field.disabled}
            className="tabular pr-8"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
        </div>
      );
      break;
    case "file":
      control = (
        <Input
          id={id}
          name={field.name}
          type="file"
          accept={field.accept}
          required={field.required}
          disabled={field.disabled}
          className="h-auto py-1.5"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      );
      break;
    case "number":
      control = (
        <Input
          id={id}
          name={field.name}
          type="number"
          min={field.min}
          max={field.max}
          step={field.step}
          defaultValue={asString(value)}
          placeholder={field.placeholder}
          required={field.required}
          disabled={field.disabled}
          className="tabular"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      );
      break;
    case "date":
    case "datetime":
      control = (
        <Input
          id={id}
          name={field.name}
          type={field.type === "date" ? "date" : "datetime-local"}
          defaultValue={asString(value)}
          required={field.required}
          disabled={field.disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      );
      break;
    default:
      control = (
        <Input
          id={id}
          name={field.name}
          type={field.type}
          maxLength={"maxLength" in field ? field.maxLength : undefined}
          autoComplete={"autoComplete" in field ? field.autoComplete : undefined}
          defaultValue={asString(value)}
          placeholder={field.placeholder}
          required={field.required}
          disabled={field.disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      );
  }

  return (
    <FieldShell
      id={id}
      label={field.label}
      required={field.required}
      hint={field.hint}
      errors={errors}
      className={span === 2 ? "sm:col-span-2" : undefined}
    >
      {control}
    </FieldShell>
  );
}
