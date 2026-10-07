import type { DocumentAccessLevel, DocumentCategory, PrismaClient } from "@prisma/client";
import { newStorageKey, sha256, storage } from "../../src/server/storage";
import { daysAgo, demoId, int } from "./lib";
import { makePdf } from "./pdf";
import type { UserIds } from "./people";

/** DEMO DATA — company document repository (files are generated placeholders). */
const FOLDERS: Record<DocumentCategory, string[]> = {
  FINANCE: ["Budgets", "Cash Flow", "Invoices", "Reports"],
  CORPORATE: ["Agreements", "Resolutions", "Meeting Minutes", "Policies"],
  SCHOOLS: ["Proposals", "Contracts", "Correspondence"],
  MARKETING: ["Brand", "Campaign Briefs", "Reports"],
  ACADEMIC: ["Curriculum", "Style Guides"],
  TECHNOLOGY: ["Architecture", "Incidents", "Roadmaps"],
  LEGAL: ["Templates", "Agreements"],
  HR: ["Policies", "Templates", "Remuneration"],
  STRATEGY: ["Plans", "Investor Relations"],
};

interface DocSeed {
  title: string;
  category: DocumentCategory;
  folder: string;
  access: DocumentAccessLevel;
  owner: string;
  tags: string[];
  versions: number;
  format: "pdf" | "csv" | "md";
  description: string;
  school?: string;
  grants?: string[];
  body?: string[];
}

const DOCS: DocSeed[] = [
  { title: "FY2026 Operating Budget (Board approved)", category: "FINANCE", folder: "Budgets", access: "DEPARTMENT", owner: "ayesha", tags: ["budget", "board", "2026"], versions: 2, format: "pdf", description: "Approved operating budget by department and category.", body: ["The FY2026 operating budget totals R6.46m in operating expenditure across six departments.", "Version 2 reflects the board's request to hold marketing spend flat in H1 and release a contingency in H2 subject to learner growth."] },
  { title: "Q3 2026 Management Accounts", category: "FINANCE", folder: "Reports", access: "DEPARTMENT", owner: "ayesha", tags: ["management accounts", "Q3"], versions: 1, format: "pdf", description: "Income statement, balance sheet and cash flow for July–September.", body: ["Revenue grew quarter on quarter, driven by subscription growth ahead of the NSC examinations and new school partnership instalments.", "Hosting costs exceeded budget due to increased video streaming; reserved-instance pricing is proposed to reduce cost."] },
  { title: "Rolling 12-month Cash Flow Forecast", category: "FINANCE", folder: "Cash Flow", access: "DEPARTMENT", owner: "ayesha", tags: ["cash flow", "forecast"], versions: 3, format: "csv", description: "Monthly cash in / cash out forecast with runway." },
  { title: "AWS Invoice — September 2026", category: "FINANCE", folder: "Invoices", access: "DEPARTMENT", owner: "ayesha", tags: ["invoice", "hosting"], versions: 1, format: "pdf", description: "Supporting document for hosting expense." },
  { title: "Shareholders' Agreement", category: "CORPORATE", folder: "Agreements", access: "RESTRICTED", owner: "sipho", tags: ["shareholders", "legal"], versions: 1, format: "pdf", description: "Executed shareholders' agreement following the seed round.", grants: ["michael", "lerato"] },
  { title: "Board Resolution — Seed Round Share Allotment", category: "CORPORATE", folder: "Resolutions", access: "EXECUTIVE", owner: "sipho", tags: ["board", "resolution"], versions: 1, format: "pdf", description: "Round resolution approving share allotment." },
  { title: "Board Meeting Minutes — Q2 2026", category: "CORPORATE", folder: "Meeting Minutes", access: "EXECUTIVE", owner: "lerato", tags: ["board", "minutes"], versions: 1, format: "pdf", description: "Minutes of the Q2 board meeting." },
  { title: "Board Meeting Minutes — Q3 2026", category: "CORPORATE", folder: "Meeting Minutes", access: "EXECUTIVE", owner: "lerato", tags: ["board", "minutes"], versions: 2, format: "pdf", description: "Minutes of the Q3 board meeting (v2 includes corrections from directors)." },
  { title: "Expense & Approvals Policy", category: "CORPORATE", folder: "Policies", access: "ALL_STAFF", owner: "ayesha", tags: ["policy", "expenses", "approvals"], versions: 3, format: "md", description: "Spending limits and the approval workflow.", body: ["# Expense & Approvals Policy", "", "All expenses above R5,000 require approval in the Executive Workspace before they are incurred.", "Finance executives may approve expenses and purchases; directors approve all other requests.", "Nobody may approve their own request. Every decision is recorded with the approver, time and comment."] },
  { title: "Information Security & POPIA Policy", category: "CORPORATE", folder: "Policies", access: "ALL_STAFF", owner: "lerato", tags: ["policy", "POPIA", "security"], versions: 2, format: "pdf", description: "How we protect personal information under POPIA." },
  { title: "Remote & Hybrid Work Policy", category: "CORPORATE", folder: "Policies", access: "ALL_STAFF", owner: "lerato", tags: ["policy", "HR"], versions: 1, format: "md", description: "Working hours, co-working access and load-shedding contingencies." },
  { title: "School Partnership Agreement Template", category: "LEGAL", folder: "Templates", access: "DEPARTMENT", owner: "michael", tags: ["template", "schools", "contract"], versions: 4, format: "pdf", description: "Standard partnership agreement with SLA and POPIA operator clauses." },
  { title: "POPIA Operator Agreement — Video Provider", category: "LEGAL", folder: "Agreements", access: "EXECUTIVE", owner: "michael", tags: ["POPIA", "vendor"], versions: 1, format: "pdf", description: "Data processing terms with our video streaming provider." },
  { title: "Partnership Agreement — Ridgeview College (signed)", category: "SCHOOLS", folder: "Contracts", access: "DEPARTMENT", owner: "michael", tags: ["contract", "signed"], versions: 1, format: "pdf", description: "Executed partnership agreement.", school: "Ridgeview College" },
  { title: "Partnership Agreement — Kopanong Secondary School (signed)", category: "SCHOOLS", folder: "Contracts", access: "DEPARTMENT", owner: "johan", tags: ["contract", "signed"], versions: 1, format: "pdf", description: "Executed 24-month partnership agreement.", school: "Kopanong Secondary School" },
  { title: "Proposal — Highveld Girls' High School", category: "SCHOOLS", folder: "Proposals", access: "DEPARTMENT", owner: "michael", tags: ["proposal"], versions: 2, format: "pdf", description: "Partnership proposal (v2 with revised per-learner pricing).", school: "Highveld Girls' High School" },
  { title: "Proposal — St Augustine's College", category: "SCHOOLS", folder: "Proposals", access: "DEPARTMENT", owner: "michael", tags: ["proposal"], versions: 1, format: "pdf", description: "Partnership proposal for Grade 11 & 12.", school: "St Augustine's College" },
  { title: "Letter of Intent — Polokwane Excellence College", category: "SCHOOLS", folder: "Correspondence", access: "DEPARTMENT", owner: "michael", tags: ["LOI"], versions: 1, format: "pdf", description: "Signed letter of intent ahead of the 2027 partnership.", school: "Polokwane Excellence College" },
  { title: "Brand Guidelines 2026", category: "MARKETING", folder: "Brand", access: "ALL_STAFF", owner: "johan", tags: ["brand", "design"], versions: 2, format: "pdf", description: "Logo usage, colours (Integral indigo #4C51BF), typography and tone of voice." },
  { title: "Campaign Brief — Matric Final Exams Countdown", category: "MARKETING", folder: "Campaign Briefs", access: "DEPARTMENT", owner: "megan", tags: ["campaign", "brief"], versions: 1, format: "pdf", description: "Objectives, audience, channels and creative plan." },
  { title: "Q3 Marketing Performance Report", category: "MARKETING", folder: "Reports", access: "DEPARTMENT", owner: "johan", tags: ["report", "Q3"], versions: 1, format: "pdf", description: "Spend, leads, CPL and CPA by channel." },
  { title: "Grade 12 Mathematics Content Style Guide", category: "ACADEMIC", folder: "Style Guides", access: "DEPARTMENT", owner: "nomvula", tags: ["style guide", "CAPS"], versions: 3, format: "md", description: "Notation, worked-example structure and video standards." },
  { title: "CAPS Coverage Tracker 2026", category: "ACADEMIC", folder: "Curriculum", access: "DEPARTMENT", owner: "nomvula", tags: ["CAPS", "tracker"], versions: 5, format: "csv", description: "Topic-by-topic coverage of the Grade 12 CAPS curriculum." },
  { title: "Physical Sciences Course Outline (draft)", category: "ACADEMIC", folder: "Curriculum", access: "DEPARTMENT", owner: "werner", tags: ["physical sciences", "draft"], versions: 1, format: "pdf", description: "Proposed structure for the 2027 Physical Sciences campus." },
  { title: "Platform Architecture Overview", category: "TECHNOLOGY", folder: "Architecture", access: "DEPARTMENT", owner: "pieter", tags: ["architecture"], versions: 2, format: "md", description: "Services, data flows and the learner-platform ↔ workspace integration." },
  { title: "Incident Report — Android Video Playback (Sep 2026)", category: "TECHNOLOGY", folder: "Incidents", access: "DEPARTMENT", owner: "kagiso", tags: ["incident", "post-mortem"], versions: 1, format: "pdf", description: "Root cause and remediation for playback stalls on low-memory devices." },
  { title: "Employee Handbook", category: "HR", folder: "Policies", access: "ALL_STAFF", owner: "lerato", tags: ["handbook", "HR"], versions: 2, format: "pdf", description: "Leave, conduct, benefits and onboarding." },
  { title: "Contractor Agreement Template", category: "HR", folder: "Templates", access: "DEPARTMENT", owner: "lerato", tags: ["template", "contractors"], versions: 1, format: "pdf", description: "Independent contractor agreement for tutors and developers." },
  { title: "Director Remuneration Schedule 2026", category: "HR", folder: "Remuneration", access: "RESTRICTED", owner: "sipho", tags: ["remuneration", "confidential"], versions: 1, format: "pdf", description: "Confidential — directors and finance only.", grants: ["michael", "lerato", "ayesha"] },
  { title: "2027 Strategic Plan (draft)", category: "STRATEGY", folder: "Plans", access: "EXECUTIVE", owner: "sipho", tags: ["strategy", "2027"], versions: 2, format: "pdf", description: "Growth priorities: Physical Sciences launch, 25 school partnerships, 3,000 paying learners." },
  { title: "Series A Investor Deck (draft)", category: "STRATEGY", folder: "Investor Relations", access: "RESTRICTED", owner: "sipho", tags: ["fundraising", "confidential"], versions: 3, format: "pdf", description: "Draft deck for the 2027 Series A raise.", grants: ["michael", "lerato", "ayesha"] },
];

function csvFor(title: string): string {
  if (title.includes("CAPS")) {
    return "topic,term,lessons_published,videos_published,quizzes,coverage_pct\nNumber Patterns,1,5,4,2,100\nFunctions & Inverses,1,4,4,2,100\nExponents & Logs,1,4,3,2,92\nFinance,1,3,3,1,85\nTrig identities,2,4,3,2,88\nCalculus,3,5,4,2,95\nAnalytical Geometry,3,3,2,1,70\nEuclidean Geometry,3,3,2,1,64\nStatistics,3,2,2,1,60\nProbability,3,2,1,1,48\n";
  }
  return "month,cash_in,cash_out,net,closing_balance\n2026-11,268000,452000,-184000,2184000\n2026-12,198000,441000,-243000,1941000\n2027-01,341000,468000,-127000,1814000\n2027-02,362000,472000,-110000,1704000\n2027-03,355000,479000,-124000,1580000\n";
}

export async function seedDocuments(db: PrismaClient, users: UserIds, schoolIdsByName: Map<string, string>) {
  const folderIds = new Map<string, string>();
  for (const [category, names] of Object.entries(FOLDERS) as [DocumentCategory, string[]][]) {
    for (const name of names) {
      const id = demoId("fld");
      folderIds.set(`${category}/${name}`, id);
      await db.documentFolder.upsert({ where: { category_name: { category, name } }, create: { id, category, name }, update: {} });
      const existing = await db.documentFolder.findUnique({ where: { category_name: { category, name } } });
      folderIds.set(`${category}/${name}`, existing!.id);
    }
  }

  const tagIds = new Map<string, string>();
  const documentIds = new Map<string, string>();
  for (const d of DOCS) {
    const id = demoId("doc");
    documentIds.set(d.title, id);
    const createdAt = daysAgo(int(20, 300));
    await db.document.create({
      data: {
        id,
        title: d.title,
        description: d.description,
        category: d.category,
        folderId: folderIds.get(`${d.category}/${d.folder}`) ?? null,
        ownerId: users[d.owner],
        accessLevel: d.access,
        schoolId: d.school ? (schoolIdsByName.get(d.school) ?? null) : null,
        currentVersion: d.versions,
        createdAt,
        updatedAt: daysAgo(int(0, 18)),
      },
    });
    for (let v = 1; v <= d.versions; v++) {
      const ext = d.format;
      const content =
        ext === "pdf"
          ? makePdf(d.title, `Version ${v} - ${d.category[0]}${d.category.slice(1).toLowerCase()} - Owner: ${d.owner}`, d.body ?? [d.description, "This placeholder document was generated by the Executive Workspace demo seed so previews, downloads and version history can be demonstrated."])
          : Buffer.from(ext === "csv" ? csvFor(d.title) : (d.body ?? [`# ${d.title}`, "", d.description]).join("\n"), "utf8");
      const key = newStorageKey();
      await storage().put(key, content);
      await db.documentVersion.create({
        data: {
          id: demoId("dv"),
          documentId: id,
          version: v,
          fileName: `${d.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}-v${v}.${ext}`,
          mimeType: ext === "pdf" ? "application/pdf" : ext === "csv" ? "text/csv" : "text/plain",
          sizeBytes: content.length,
          storageKey: key,
          checksum: sha256(content),
          changeNote: v === 1 ? "Initial upload" : v === d.versions ? "Latest revision after review" : "Revised draft",
          uploadedById: users[d.owner],
          createdAt: new Date(createdAt.getTime() + (v - 1) * 9 * 86_400_000),
        },
      });
    }
    for (const tag of d.tags) {
      if (!tagIds.has(tag)) {
        const t = await db.tag.upsert({ where: { name: tag }, create: { id: demoId("tag"), name: tag }, update: {} });
        tagIds.set(tag, t.id);
      }
      await db.documentTag.create({ data: { documentId: id, tagId: tagIds.get(tag)! } });
    }
    for (const g of d.grants ?? []) {
      await db.documentAccessGrant.create({ data: { documentId: id, userId: users[g] } });
    }
  }

  // Link signed contracts to their partnerships.
  for (const [title, school] of [
    ["Partnership Agreement — Ridgeview College (signed)", "Ridgeview College"],
    ["Partnership Agreement — Kopanong Secondary School (signed)", "Kopanong Secondary School"],
  ] as const) {
    const schoolId = schoolIdsByName.get(school);
    if (schoolId) await db.partnership.updateMany({ where: { schoolId }, data: { contractDocumentId: documentIds.get(title) } });
  }
  return documentIds;
}
