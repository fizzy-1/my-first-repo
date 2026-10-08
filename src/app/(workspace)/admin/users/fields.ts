import type { FieldDef, FieldOption, FormValues } from "@/components/forms/types";
import { EMPLOYMENT_TYPE, optionsOf } from "@/lib/labels";

export interface UserFormOptions {
  roles: FieldOption[];
  departments: FieldOption[];
  managers: FieldOption[];
}

export function userFields(options: UserFormOptions, opts: { isSelf?: boolean } = {}): FieldDef[] {
  return [
    { type: "text", name: "name", label: "Full name", required: true, maxLength: 120, placeholder: "e.g. Thandi Mokoena", autoComplete: "off" },
    { type: "email", name: "email", label: "Work email", required: true, placeholder: "name@integralacademy.co.za", autoComplete: "off" },
    {
      type: "select",
      name: "roleKey",
      label: "Role",
      required: true,
      options: options.roles,
      disabled: opts.isSelf,
      hint: opts.isSelf ? "You can't change your own role." : "Decides what they can see and do. See Roles & permissions.",
    },
    { type: "select", name: "employmentType", label: "Employment type", required: true, options: optionsOf(EMPLOYMENT_TYPE) },
    { type: "select", name: "departmentId", label: "Department", options: options.departments, emptyLabel: "No department" },
    { type: "text", name: "jobTitle", label: "Job title", maxLength: 120, placeholder: "e.g. Finance Manager" },
    { type: "select", name: "managerId", label: "Manager", options: options.managers, emptyLabel: "No manager", span: 2 },
  ];
}

export const newUserDefaults: FormValues = { employmentType: "EMPLOYEE" };

export function userDefaults(u: {
  name: string;
  email: string;
  roleKey: string;
  departmentId: string | null;
  jobTitle: string | null;
  managerId: string | null;
  employmentType: string;
}): FormValues {
  return {
    name: u.name,
    email: u.email,
    roleKey: u.roleKey,
    departmentId: u.departmentId ?? "",
    jobTitle: u.jobTitle ?? "",
    managerId: u.managerId ?? "",
    employmentType: u.employmentType,
  };
}
