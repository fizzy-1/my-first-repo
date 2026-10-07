import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BellRingIcon, CalendarIcon, FileTextIcon, GlobeIcon, MailIcon, MapPinIcon, PencilIcon, PhoneIcon, PlusIcon, StarIcon, Trash2Icon, UserPlusIcon } from "lucide-react";
import type { SchoolStage } from "@prisma/client";
import {
  deleteContactAction,
  deleteSchoolAction,
  moveSchoolStageAction,
  saveContactAction,
  savePartnershipAction,
  setFollowUpAction,
  updateSchoolAction,
} from "@/server/actions/schools";
import { createTaskAction } from "@/server/actions/tasks";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors";
import { activeUserOptions, departmentOptions } from "@/server/rbac";
import { getSchool, schoolDocumentOptions } from "@/server/services/schools";
import { projectOptions } from "@/server/services/tasks";
import { DueDate } from "@/components/common/due-date";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { StatusMenu } from "@/components/common/status-menu";
import { UserChip } from "@/components/common/user-chip";
import { ConfirmActionButton } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";
import { RowMenu } from "@/components/forms/row-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toDateInput } from "@/lib/dates";
import { BILLING_FREQUENCY, DOCUMENT_CATEGORY, MEETING_TYPE, PARTNERSHIP_STATUS, PROVINCE, SCHOOL_STAGE, SCHOOL_TYPE, TASK_STATUS } from "@/lib/labels";
import { formatDate, formatDateTime, formatNumber, formatRelative, formatZAR } from "@/lib/format";
import { taskDefaults, taskFields } from "../../tasks/task-fields";
import { contactFields, partnershipFields, schoolDefaults, schoolFields } from "../fields";
import { NoteForm } from "./note-form";

export const metadata: Metadata = { title: "School" };

export default async function SchoolPage(props: PageProps<"/schools/[id]">) {
  const { id } = await props.params;
  const user = await requirePageAccess("schools.read");
  let school: Awaited<ReturnType<typeof getSchool>>;
  try {
    school = await getSchool(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const canWrite = can(user, "schools.write");
  const [users, documents, departments, projects] = await Promise.all([activeUserOptions(), schoolDocumentOptions(user), departmentOptions(), projectOptions()]);
  const ownerOpts = users.map(({ value, label }) => ({ value, label }));
  const followUpOverdue = school.nextFollowUpAt && school.nextFollowUpAt < new Date() && school.stage !== "LOST";

  const info: { icon: React.ComponentType<{ className?: string }>; value: React.ReactNode }[] = [
    { icon: MapPinIcon, value: [school.address ?? school.city, PROVINCE[school.province].label].filter(Boolean).join(", ") },
    ...(school.phone ? [{ icon: PhoneIcon, value: <a href={`tel:${school.phone}`} className="hover:underline">{school.phone}</a> }] : []),
    ...(school.email ? [{ icon: MailIcon, value: <a href={`mailto:${school.email}`} className="hover:underline">{school.email}</a> }] : []),
    ...(school.website ? [{ icon: GlobeIcon, value: <a href={school.website} target="_blank" rel="noopener noreferrer" className="hover:underline">{school.website}</a> }] : []),
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Schools & partnerships", href: "/schools" }, { label: school.name }]}
        title={school.name}
        meta={
          <>
            <StatusMenu id={school.id} value={school.stage} meta={SCHOOL_STAGE} options={Object.keys(SCHOOL_STAGE) as SchoolStage[]} action={moveSchoolStageAction} disabled={!canWrite} />
            <Badge tone="outline">{SCHOOL_TYPE[school.type].label}</Badge>
            {school.emisNumber && <Badge tone="outline">EMIS {school.emisNumber}</Badge>}
            {followUpOverdue && <Badge tone="danger">Follow-up overdue</Badge>}
          </>
        }
        actions={
          canWrite && (
            <>
              <FormDialog
                title="Set follow-up reminder"
                description="The owner is notified when the follow-up is due."
                size="sm"
                trigger={
                  <Button variant="outline">
                    <BellRingIcon /> Follow-up
                  </Button>
                }
                action={setFollowUpAction}
                fields={[
                  { type: "hidden", name: "id", value: school.id },
                  { type: "date", name: "nextFollowUpAt", label: "Follow up on", span: 2, hint: "Leave empty to clear the reminder." },
                ]}
                defaultValues={{ nextFollowUpAt: toDateInput(school.nextFollowUpAt) }}
                submitLabel="Save reminder"
              />
              <FormDialog
                title={`Edit ${school.name}`}
                size="lg"
                trigger={
                  <Button variant="outline">
                    <PencilIcon /> Edit
                  </Button>
                }
                action={updateSchoolAction}
                fields={[{ type: "hidden", name: "id", value: school.id }, ...schoolFields(ownerOpts)]}
                defaultValues={schoolDefaults(school)}
                submitLabel="Save changes"
              />
              <ConfirmActionButton variant="ghost" size="icon" aria-label="Delete school" action={deleteSchoolAction} input={{ id: school.id }} title={`Delete ${school.name}?`} description="Schools with partnerships or invoices can't be deleted — mark them as Lost instead." confirmLabel="Delete">
                <Trash2Icon />
              </ConfirmActionButton>
            </>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {[
          ["Learners", formatNumber(school.learnerCount)],
          ["Potential learners", formatNumber(school.potentialLearners)],
          ["Active platform learners", formatNumber(school.activeLearners)],
          ["Expected annual value", formatZAR(school.expectedAnnualValue)],
          ["Win probability", `${school.probability}%`],
          ["Invoiced to date", formatZAR(school.invoicedToDate)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="tabular mt-1 text-base font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <SectionCard
            title="Partnerships & contracts"
            actions={
              canWrite && (
                <FormDialog
                  title="Record partnership"
                  trigger={
                    <Button size="sm" variant="outline">
                      <PlusIcon /> Partnership
                    </Button>
                  }
                  action={savePartnershipAction}
                  fields={[{ type: "hidden", name: "schoolId", value: school.id }, ...partnershipFields(documents)]}
                  defaultValues={{ status: "DRAFT", billingFrequency: "QUARTERLY", startDate: toDateInput(new Date()), annualValue: school.expectedAnnualValue.toFixed(2), learnersCovered: String(school.potentialLearners) }}
                  submitLabel="Save partnership"
                />
              )
            }
          >
            {school.partnerships.length === 0 ? (
              <p className="text-sm text-muted-foreground">No partnership yet. Expected revenue: {formatZAR(school.expectedAnnualValue)} per year at {school.probability}% probability.</p>
            ) : (
              <ul className="space-y-3">
                {school.partnerships.map((p) => (
                  <li key={p.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge meta={PARTNERSHIP_STATUS} value={p.status} />
                      <span className="tabular font-semibold">{formatZAR(p.annualValue)}/yr</span>
                      <span className="text-sm text-muted-foreground">· {formatNumber(p.learnersCovered)} learners · billed {BILLING_FREQUENCY[p.billingFrequency].label.toLowerCase()}</span>
                      {canWrite && (
                        <span className="ml-auto">
                          <RowMenu
                            label="partnership"
                            edit={{
                              title: "Edit partnership",
                              action: savePartnershipAction,
                              fields: [{ type: "hidden", name: "schoolId", value: school.id }, { type: "hidden", name: "partnershipId", value: p.id }, ...partnershipFields(documents)],
                              defaults: {
                                status: p.status,
                                billingFrequency: p.billingFrequency,
                                startDate: toDateInput(p.startDate),
                                endDate: toDateInput(p.endDate),
                                annualValue: p.annualValue.toFixed(2),
                                learnersCovered: String(p.learnersCovered),
                                contractDocumentId: p.contractDocumentId ?? "",
                                notes: p.notes ?? "",
                              },
                            }}
                          />
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatDate(p.startDate)} → {p.endDate ? formatDate(p.endDate) : "open-ended"}
                    </p>
                    {p.contractDocument && (
                      <Link href={`/documents/${p.contractDocument.id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary-soft-foreground hover:underline">
                        <FileTextIcon className="size-4" /> {p.contractDocument.title}
                      </Link>
                    )}
                    {p.notes && <p className="mt-2 text-sm">{p.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Notes" description="Conversation history and context">
            {canWrite && (
              <div className="mb-5">
                <NoteForm schoolId={school.id} />
              </div>
            )}
            {school.notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            ) : (
              <ol className="space-y-4">
                {school.notes.map((n) => (
                  <li key={n.id} className="border-l-2 border-border pl-4">
                    <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.author.name} · <span title={formatDateTime(n.createdAt)}>{formatRelative(n.createdAt)}</span>
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          <SectionCard
            title="Tasks"
            actions={
              <FormDialog
                title={`New task for ${school.name}`}
                trigger={
                  <Button size="sm" variant="outline">
                    <PlusIcon /> Task
                  </Button>
                }
                action={createTaskAction}
                fields={[{ type: "hidden", name: "schoolId", value: school.id }, ...taskFields({ users: ownerOpts, departments, projects, canAssign: can(user, "tasks.assign") })]}
                defaultValues={{ ...taskDefaults(), title: `Follow up with ${school.name}`, assigneeId: school.ownerId ?? "" }}
                submitLabel="Create task"
              />
            }
          >
            {school.tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks linked to this school.</p>
            ) : (
              <ul className="divide-y divide-border">
                {school.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                      {t.title}
                    </Link>
                    <StatusBadge meta={TASK_STATUS} value={t.status} />
                    <span className="hidden text-xs text-muted-foreground sm:inline">{t.assignee?.name}</span>
                    <DueDate date={t.dueDate} done={t.status === "COMPLETED"} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Details">
            <ul className="space-y-2.5 text-sm">
              {info.map((row, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <row.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 break-words">{row.value}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-2.5 border-t border-border pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Assigned executive</dt>
                <dd>
                  <UserChip name={school.owner?.name} />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Next follow-up</dt>
                <dd>
                  <DueDate date={school.nextFollowUpAt} done={school.stage === "LOST"} />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">In stage since</dt>
                <dd>{formatDate(school.stageChangedAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Lead source</dt>
                <dd>{school.source ?? "—"}</dd>
              </div>
              {school.lostReason && (
                <div>
                  <dt className="text-muted-foreground">Lost reason</dt>
                  <dd className="mt-1">{school.lostReason}</dd>
                </div>
              )}
            </dl>
          </SectionCard>

          <SectionCard
            title="Contacts"
            actions={
              canWrite && (
                <FormDialog
                  title="Add contact"
                  trigger={
                    <Button size="sm" variant="outline">
                      <UserPlusIcon /> Add
                    </Button>
                  }
                  action={saveContactAction}
                  fields={[{ type: "hidden", name: "schoolId", value: school.id }, ...contactFields]}
                  defaultValues={{ isPrimary: school.contacts.length === 0 }}
                  submitLabel="Save contact"
                />
              )
            }
          >
            {school.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts yet.</p>
            ) : (
              <ul className="space-y-3">
                {school.contacts.map((c) => (
                  <li key={c.id} className="flex items-start gap-3">
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">
                        {c.name} {c.isPrimary && <StarIcon className="inline size-3.5 fill-warning text-warning" aria-label="Primary contact" />}
                      </p>
                      <p className="text-xs text-muted-foreground">{c.position}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
                        {c.email && <a href={`mailto:${c.email}`} className="text-primary-soft-foreground hover:underline">{c.email}</a>}
                        {c.phone && <a href={`tel:${c.phone}`} className="text-muted-foreground hover:underline">{c.phone}</a>}
                      </div>
                    </div>
                    {canWrite && (
                      <RowMenu
                        label={c.name}
                        edit={{
                          title: `Edit ${c.name}`,
                          action: saveContactAction,
                          fields: [{ type: "hidden", name: "schoolId", value: school.id }, { type: "hidden", name: "contactId", value: c.id }, ...contactFields],
                          defaults: { name: c.name, position: c.position, email: c.email ?? "", phone: c.phone ?? "", isPrimary: c.isPrimary },
                        }}
                        remove={{ action: deleteContactAction, input: { id: c.id }, title: `Remove ${c.name}?`, description: "The contact is removed from this school." }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Meetings">
            {school.meetings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No meetings recorded.</p>
            ) : (
              <ul className="space-y-2.5">
                {school.meetings.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm">
                    <CalendarIcon className="size-4 text-muted-foreground" />
                    <Link href={`/meetings/${m.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      {m.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">{formatDate(m.startsAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/meetings?new=meeting`} className="mt-3 inline-block text-xs text-muted-foreground hover:text-foreground">
              Schedule a {MEETING_TYPE.SCHOOL.label.toLowerCase()} meeting →
            </Link>
          </SectionCard>

          <SectionCard title="Documents">
            {school.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents linked.</p>
            ) : (
              <ul className="space-y-2.5">
                {school.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-sm">
                    <FileTextIcon className="size-4 text-muted-foreground" />
                    <Link href={`/documents/${d.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      {d.title}
                    </Link>
                    <StatusBadge meta={DOCUMENT_CATEGORY} value={d.category} dot={false} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
