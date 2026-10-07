import type { FieldDef, FieldOption, FormValues } from "@/components/forms/types";
import { toDateInput } from "@/lib/dates";
import { BILLING_FREQUENCY, optionsOf, PARTNERSHIP_STATUS, PROVINCE, SCHOOL_STAGE, SCHOOL_TYPE } from "@/lib/labels";

export function schoolFields(owners: FieldOption[]): FieldDef[] {
  return [
    { type: "text", name: "name", label: "School name", required: true, span: 2 },
    { type: "select", name: "type", label: "Type", required: true, options: optionsOf(SCHOOL_TYPE) },
    { type: "text", name: "emisNumber", label: "EMIS number", hint: "Department of Basic Education identifier" },
    { type: "select", name: "province", label: "Province", required: true, options: optionsOf(PROVINCE) },
    { type: "text", name: "city", label: "City / town", required: true },
    { type: "text", name: "address", label: "Address", span: 2 },
    { type: "tel", name: "phone", label: "Phone" },
    { type: "email", name: "email", label: "Email" },
    { type: "url", name: "website", label: "Website", span: 2 },
    { type: "heading", name: "pipeline", label: "Pipeline" },
    { type: "select", name: "stage", label: "Stage", required: true, options: optionsOf(SCHOOL_STAGE) },
    { type: "select", name: "ownerId", label: "Assigned executive", options: owners, emptyLabel: "Me" },
    { type: "number", name: "learnerCount", label: "Number of learners", required: true, min: 0 },
    { type: "number", name: "potentialLearners", label: "Potential learners", required: true, min: 0, hint: "Grade 11–12 learners we could enrol" },
    { type: "money", name: "expectedAnnualValue", label: "Expected annual value", required: true },
    { type: "number", name: "probability", label: "Win probability (%)", min: 0, max: 100, hint: "Defaults from the stage" },
    { type: "date", name: "nextFollowUpAt", label: "Next follow-up" },
    { type: "text", name: "source", label: "Lead source", placeholder: "Referral, expo, inbound…" },
    { type: "textarea", name: "lostReason", label: "Lost reason", rows: 2, hint: "Only used when the stage is Lost" },
  ];
}

export function schoolDefaults(s?: {
  name: string;
  emisNumber: string | null;
  type: string;
  province: string;
  city: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  learnerCount: number;
  potentialLearners: number;
  stage: string;
  expectedAnnualValue: number;
  probability: number;
  ownerId: string | null;
  nextFollowUpAt: Date | null;
  source: string | null;
  lostReason: string | null;
}): FormValues {
  if (!s) return { type: "PUBLIC", province: "GAUTENG", stage: "PROSPECT", learnerCount: "0", potentialLearners: "0", expectedAnnualValue: "0" };
  return {
    name: s.name,
    emisNumber: s.emisNumber ?? "",
    type: s.type,
    province: s.province,
    city: s.city,
    address: s.address ?? "",
    phone: s.phone ?? "",
    email: s.email ?? "",
    website: s.website ?? "",
    learnerCount: String(s.learnerCount),
    potentialLearners: String(s.potentialLearners),
    stage: s.stage,
    expectedAnnualValue: s.expectedAnnualValue.toFixed(2),
    probability: String(s.probability),
    ownerId: s.ownerId ?? "",
    nextFollowUpAt: toDateInput(s.nextFollowUpAt),
    source: s.source ?? "",
    lostReason: s.lostReason ?? "",
  };
}

export function partnershipFields(documents: FieldOption[]): FieldDef[] {
  return [
    { type: "select", name: "status", label: "Status", required: true, options: optionsOf(PARTNERSHIP_STATUS) },
    { type: "select", name: "billingFrequency", label: "Billing", required: true, options: optionsOf(BILLING_FREQUENCY) },
    { type: "date", name: "startDate", label: "Start date", required: true },
    { type: "date", name: "endDate", label: "End date" },
    { type: "money", name: "annualValue", label: "Annual value", required: true },
    { type: "number", name: "learnersCovered", label: "Learners covered", required: true, min: 0 },
    { type: "select", name: "contractDocumentId", label: "Contract document", options: documents, emptyLabel: "None", span: 2 },
    { type: "textarea", name: "notes", label: "Notes", rows: 2 },
  ];
}

export const contactFields: FieldDef[] = [
  { type: "text", name: "name", label: "Name", required: true },
  { type: "text", name: "position", label: "Position", required: true, placeholder: "Principal, HOD Mathematics…" },
  { type: "email", name: "email", label: "Email" },
  { type: "tel", name: "phone", label: "Phone" },
  { type: "checkbox", name: "isPrimary", label: "Primary contact", span: 2 },
];
