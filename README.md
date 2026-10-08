# Integral Academy — Executive Workspace

A private internal business operating system for the directors, managers and staff of
**Integral Academy**, a South African Grade 12 Mathematics edtech company. One place to see
and act on revenue, learners, schools, marketing, academic production, product, people,
documents, approvals, meetings and strategy.

> _Summing knowledge. Shaping futures._

This is an internal tool. It is not the learner platform; it **reads** learner data through
a narrow integration layer (see [Learner platform integration](#learner-platform-integration)).

---

## Contents

1. [What's in the workspace](#whats-in-the-workspace)
2. [Tech stack](#tech-stack)
3. [Getting started](#getting-started)
4. [Environment variables](#environment-variables)
5. [Database & migrations](#database--migrations)
6. [Demo data](#demo-data)
7. [Architecture](#architecture)
8. [Authentication & sessions](#authentication--sessions)
9. [Roles & permissions (RBAC)](#roles--permissions-rbac)
10. [Audit trail](#audit-trail)
11. [Routes](#routes)
12. [Scheduled jobs & integrations](#scheduled-jobs--integrations)
13. [Testing & quality](#testing--quality)
14. [Known limitations](#known-limitations)
15. [Recommended next steps](#recommended-next-steps)

---

## What's in the workspace

| Module | Highlights |
| --- | --- |
| **Executive dashboard** | KPI cards (revenue, active learners, MRR, churn, schools, cash & runway) with period-over-period deltas; revenue and learner-growth charts (7d / 30d / 3m / 6m / 12m); school pipeline; action centre (pending approvals, overdue tasks, deadlines, critical bugs); recent activity; company announcements; per-user widget visibility and order. |
| **Business intelligence** | Learners, subscriptions & revenue, schools, marketing, academic and financial KPI views with a server-side period filter and CSV exports. |
| **Finance** | Overview, income, expenses (auto-routed for approval above R5,000), monthly/annual cash flow, budgets vs actual with burn-down, and Conservative / Base / Aggressive projections. |
| **Schools & partnerships** | CRM list and Kanban pipeline (Lead → Contacted → Meeting → Proposal → Negotiation → Won/Lost), contacts, notes, partnerships, follow-up reminders, renewals. |
| **Marketing** | Campaigns with budgets, assigned team, weekly metrics (spend, leads, conversions, CPL), approvals and a campaign calendar. |
| **Academic** | Content pipeline (Idea → Planned → Recording → Editing → Review → Approved → Published), courses & topics, tutors, tutor hours with an approval queue, engagement from the learner platform. |
| **Product & technology** | Roadmap board, bug tracker (critical/high bugs alert the product team), development tasks. |
| **Team** | Directory, reporting lines, department headcount; cost to company and performance metrics are permission-gated at field level. |
| **Documents** | Folder tree by category, upload with type + magic-byte validation, versioning, in-browser preview (PDF, images, text/CSV), access levels (all staff / department / executive / restricted with named grants), tags, search, archive. |
| **Calendar** | Month grid and agenda across meetings, task deadlines, approvals, follow-ups, campaigns, content and renewals — each source filtered by the viewer's permissions. |
| **Approvals** | Pending / Approved / Rejected / Changes requested, decision records with comments, resubmission, finance-only approvals for finance types; requesters can never approve their own request. |
| **Meetings** | Board, executive, marketing, academic, developer and school meetings; invitations, RSVPs, rescheduling, attendance, agenda & notes, recorded decisions, and **action items that become real tasks** in the owner's task list. |
| **Strategy** | Annual company objectives with quarterly children; On Track / At Risk / Delayed / Completed; live metric-linked progress (e.g. paying learners, MRR, runway) and progress history. |
| **Tasks** | Personal, department and company views, projects, priorities, due dates, attachments, links to meetings, schools, features and bugs. |
| **Notifications & search** | Notification centre with unread counts; global grouped search (⌘K) across every module the user can see. |
| **Administration** | Users (create with one-time temporary password, roles, suspend/offboard, reset, unlock), roles & permissions matrix, audit log viewer with export, announcements. |

The interface uses the Integral Academy crest and palette (navy, heraldic gold, paper), is dark
by default with a light theme, and is responsive down to phone width.

## Tech stack

- **Next.js 16** (App Router, React Server Components, Server Actions, Turbopack) with **React 19** and **TypeScript** (strict)
- **Tailwind CSS v4** with design tokens in `src/app/globals.css`; accessible primitives from **Radix UI**; icons from **lucide-react**
- **PostgreSQL 16** via **Prisma 6**
- **Recharts** for charts (palette validated for colour-vision deficiency in both themes)
- **Zod** for all input validation
- Custom database-backed session authentication (no third-party auth dependency)

## Getting started

Prerequisites: Node.js 20.9+ (22 recommended), npm, and PostgreSQL 16 (Docker is the easiest way).

```bash
# 1. Install dependencies (also generates the Prisma client)
npm install

# 2. Configure the environment
cp .env.example .env            # then edit secrets — see below

# 3. Start PostgreSQL (or point DATABASE_URL at your own server)
docker compose up -d

# 4. Create the schema
npm run db:deploy               # applies every migration in prisma/migrations

# 5a. Development: load the clearly-labelled demo data…
npm run db:seed
# 5b. …or production-style: create your first administrator instead
npm run admin:create -- --email you@integralacademy.co.za --name "Your Name"

# 6. Run the app
npm run dev                     # http://localhost:3000
```

Production build: `npm run build && npm run start` (run behind HTTPS; the session cookie becomes
`__Host-` prefixed and `Secure` when `NODE_ENV=production`).

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string used by Prisma. |
| `APP_URL` | yes | Public base URL (absolute links in notifications and exports). |
| `SESSION_TTL_DAYS` | no (7) | Sliding session lifetime in days. Sessions are also capped at 30 days absolute. |
| `STORAGE_DIR` | no (`./storage/uploads`) | Where the local storage adapter writes uploaded documents. Keep it outside `public/`. |
| `CRON_SECRET` | for jobs | Bearer token for `POST /api/cron/deadlines`. Generate with `openssl rand -hex 32`. |
| `LEARNER_PLATFORM_SYNC_TOKEN` | for sync | Bearer token for `POST /api/integrations/learner-platform/sync`. The endpoint is disabled (503) when unset. |
| `SEED_DEMO_PASSWORD` | dev only | Password given to every seeded demo account. |
| `DEMO_MODE` | no | `true` shows the "Demo data" badge in the top bar. |
| `ALLOW_DEMO_SEED` | no | The seed refuses to run when `NODE_ENV=production` unless this is `true`. |

Secrets live only in `.env` (git-ignored). Nothing secret is exposed to the browser.

## Database & migrations

The schema (`prisma/schema.prisma`, 53 models) is normalised around the business domains:
organisation & access (departments, roles, permissions, users, sessions, login attempts),
work (projects, tasks, attachments, notifications, announcements, approvals & decisions),
learner read-model (plans, learners — no learner PII —, subscriptions, payments, weekly
engagement), finance (cash accounts, income, expenses, budgets & lines, projections), schools
(schools, contacts, notes, partnerships), marketing (campaigns, members, weekly metrics),
academic (courses, topics, lessons, content items, tutor profiles, time entries), technology
(features, bugs), documents (folders, documents, versions, tags, access grants), meetings
(attendees, decisions), strategy (objectives, updates) and the audit log.

Integrity is enforced in the database, not just the UI: foreign keys with explicit delete
behaviour, unique constraints (e.g. one notification per `(user, dedupeKey)`, one metric row
per campaign per week), `CHECK` constraints on money, percentages and date ranges
(`prisma/migrations/*_integrity_constraints`), indexes on every filter/sort path, and a
trigger that makes `AuditLog` append-only.

```bash
npm run db:migrate     # create + apply a new migration during development (prisma migrate dev)
npm run db:deploy      # apply pending migrations (CI / production)
npm run db:generate    # regenerate the Prisma client
npm run db:studio      # browse data
npm run db:reset       # DESTRUCTIVE: drop and recreate the dev database
```

## Demo data

`npm run db:seed` loads a realistic, deterministic dataset in South African Rand: 17 staff across
six departments, ~3,900 learners (≈2,400 currently active) with subscriptions and payments, 36 fictional schools in every
pipeline stage, campaigns with weekly metrics, a content pipeline, tutor hours, finances with a
seed round, budgets and projections, roadmap and bugs, 31 documents with versions, meetings,
approvals, objectives, tasks, notifications and activity.

- Every demo row has an id starting with `demo_` and every demo account uses `@integral.demo`.
- All demo accounts share the password in `SEED_DEMO_PASSWORD` (default `Integral!2026`).
- **Remove all demo data** (rows and uploaded files) with `npm run demo:remove`. Real records you
  created are kept. Roles, permissions and departments are structural and remain.
- The seed refuses to run in production unless `ALLOW_DEMO_SEED=true`.

| Demo account | Role |
| --- | --- |
| `sipho@integral.demo` | Super Admin (CEO) |
| `michael@integral.demo`, `lerato@integral.demo` | Director |
| `ayesha@integral.demo` | Finance Executive |
| `johan@integral.demo` | Marketing Executive |
| `nomvula@integral.demo` | Head Tutor |
| `pieter@integral.demo` | Product Manager |
| `kagiso@integral.demo`, `ruan@integral.demo`, `zanele@integral.demo` | Developer |
| `tshepo@integral.demo`, `megan@integral.demo` | Marketing Staff |
| `bongani@integral.demo` and four others | Tutor |

## Architecture

```
src/
  app/
    (auth)/login            sign-in page
    (workspace)/…           every authenticated module (server components)
    api/…                   route handlers: exports, document downloads, search, notifications,
                            cron, learner-platform sync, health
  components/               UI kit (ui/), forms, data tables, charts, shell, kanban
  lib/                      pure, shared code: rbac definitions, validation, dates (SAST),
                            formatting, labels, list params, CSV, projections
  server/
    auth/                   password hashing, sessions, current user, permission helpers
    services/               ALL data access + business rules + permission enforcement
    actions/                "use server" entry points: zod-validate → call a service
    integrations/           learner-platform read model (interface + Prisma source + sync)
    jobs/                   deadline / overdue sweep
    storage/                storage adapter (local disk; swap for S3)
    audit.ts, notify.ts     cross-cutting audit trail and notifications
  proxy.ts                  edge gate: redirect unauthenticated requests, per-request CSP nonce
prisma/                     schema, migrations, seed (+ demo removal)
scripts/                    create-admin, run-deadline-job
```

Request flow: page or action → `requireUser()` / `requirePageAccess()` → **service** (checks
permissions with `assertCan` and applies row-level `where` filters such as
`tasksVisibleWhere`, `documentsVisibleWhere`, `meetingsVisibleWhere`) → Prisma → audit +
notifications. Lists are paginated, filtered and sorted in SQL; time-series metrics are bucketed
in SQL in South African time (`Africa/Johannesburg`).

The UI never decides access on its own: hiding a button is a convenience, the service is the
gate. Server actions return typed `ActionState` objects that forms render as field errors and
toasts.

### Learner platform integration

Learner metrics come through a `LearnerPlatformSource` interface
(`src/server/integrations/learner-platform/types.ts`). Today it is backed by tables in this
database (`PrismaLearnerPlatformSource`), populated by the seed or by the authenticated sync
endpoint. Pointing the workspace at the live learner platform means implementing that interface
against its API or read replica (or pushing data to the sync endpoint) — no dashboard code
changes. The workspace stores no learner names or contact details.

### Dashboard customisation

Widgets are registered in `src/server/services/dashboard.ts` (`DASHBOARD_WIDGETS`) and each user's
hidden widgets and order are stored in `DashboardPreference`. Adding a widget means registering
it and rendering it; per-role defaults and drag-to-reorder can build on the same model.

## Authentication & sessions

- **Passwords**: scrypt (N = 2¹⁵, r = 8, p = 1, random 16-byte salt, 64-byte key; parameters
  stored with each hash and upgraded transparently on next sign-in); new passwords need 12+
  characters with upper/lower case, a number and a symbol.
- **Sessions**: 256-bit random token in an `HttpOnly`, `SameSite=Lax` cookie (`__Host-` and
  `Secure` in production). Only the SHA-256 hash is stored, so a database leak can't be replayed.
  Sliding 7-day expiry, 30-day absolute cap, revoked on logout, password change ("sign out other
  sessions"), suspension or offboarding.
- **Brute-force protection**: every attempt is recorded; per-IP (20) and per-email (8) failure
  limits per 15 minutes, and a 15-minute account lock after 5 consecutive failures; constant-time
  hash comparison and a dummy hash for unknown emails so responses don't reveal which accounts
  exist.
- **Temporary passwords**: administrators issue one-time passwords; the user must set a new one
  before using the workspace.
- **Request protection**: `src/proxy.ts` redirects unauthenticated page requests to `/login`
  (with a safe `next` parameter), sets a per-request nonce-based Content-Security-Policy, and the
  app sends HSTS (production), `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy` and COOP headers. Server Actions are POST-only with Next's origin checks.
- **Files**: uploads are size-limited (20 MB), extension- and magic-byte-checked, stored outside
  the web root with random keys and served only through an authenticated, permission-checked
  route (inline only for safe previewable types, otherwise as attachments).

## Roles & permissions (RBAC)

Permissions are fine-grained strings (`finance.read`, `approvals.decide.finance`,
`team.read.sensitive`, …) defined in `src/lib/rbac.ts` together with the nine system roles.
They are synced to the `Role` / `Permission` / `RolePermission` tables by the seed and by
`npm run admin:create`, so the database always mirrors the code.

| Role | Scope |
| --- | --- |
| Super Admin | Everything, including user administration and the audit log. |
| Director | Everything except user administration. |
| Finance Executive | Finance, budgets, projections, finance approvals, schools/marketing visibility, sensitive team data, executive documents. |
| Marketing Executive | Marketing campaigns, schools pipeline and partnerships. |
| Head Tutor | Academic operations, content pipeline, tutor hour approval. |
| Product Manager | Roadmap, bugs, development, plus academic visibility. |
| Developer | Roadmap and the bugs / tasks assigned to them. |
| Marketing Staff | Campaigns they're assigned to, including recording metrics. |
| Tutor | Their assigned content and their own tutor hours. |

Executive roles share a base (dashboard, BI, exports, approvals submission, meetings, strategy,
department tasks, task assignment); every role has the staff base (team directory, documents,
calendar, bug reporting). Enforcement happens in three places: navigation (hidden modules),
page guards (`requirePageAccess` → `/access-denied`), and — authoritatively — services
(`assertCan` + row-level filters, including field-level hiding of salaries and phone numbers).
The **Administration → Roles & permissions** page shows the full matrix.

## Audit trail

Every mutation writes an `AuditLog` row: who, what action, which entity, a human-readable
summary, the previous and new values (diffs only; never passwords or file contents), IP and
user agent. The table is append-only at the database level. Entries flagged for the feed power
the dashboard's Recent Activity, filtered by what the viewer may see. Exports and
executive/restricted document downloads are audited too.

## Routes

| Path | Purpose | Access |
| --- | --- | --- |
| `/login` | Sign in | public |
| `/dashboard` | Executive dashboard | signed in (widgets by permission) |
| `/intelligence` | Business intelligence | `intelligence.read` |
| `/tasks`, `/tasks/[id]`, `/tasks/projects` | Tasks and projects | signed in (row-level) |
| `/finance` (+ `/income`, `/expenses`, `/cash-flow`, `/budgets`, `/budgets/[id]`, `/projections`) | Finance | `finance.read` (+ write/budgets/projections) |
| `/schools`, `/schools/[id]` | Schools CRM & pipeline | `schools.read` |
| `/marketing`, `/marketing/[id]` | Campaigns | `marketing.read` / `.assigned` |
| `/academic` (+ `/courses`, `/tutors`, `/hours`) | Academic operations | `academic.read` / `.assigned` |
| `/technology` (+ `/bugs`, `/tasks`) | Product & technology | `technology.read` / `.assigned` / `bugs.report` |
| `/team`, `/team/[id]` | Team directory | `team.read` (sensitive fields gated) |
| `/documents`, `/documents/[id]` | Documents | `documents.read` (row-level) |
| `/calendar` | Company calendar | `calendar.read` |
| `/approvals`, `/approvals/[id]` | Approvals | signed in (row-level) |
| `/meetings`, `/meetings/[id]` | Meetings | signed in (attendees; directors see all) |
| `/strategy`, `/strategy/[id]` | Objectives | `strategy.read` |
| `/notifications` | Notification centre | signed in |
| `/search` | Full search results | signed in |
| `/profile` | Profile, password, sessions | signed in |
| `/admin` (+ `/users`, `/roles`, `/audit`, `/announcements`) | Administration | `admin.users` / `admin.roles` / `audit.read` / `announcements.write` |
| `GET /api/reports/[report]` | CSV exports (audited) | per report |
| `GET /api/documents/[versionId]` | Document download / preview | document visibility |
| `GET /api/search`, `GET /api/notifications` | Command palette & bell | signed in |
| `POST /api/cron/deadlines` | Deadline sweep | `Bearer CRON_SECRET` |
| `POST /api/integrations/learner-platform/sync` | Learner data sync | `Bearer LEARNER_PLATFORM_SYNC_TOKEN` |
| `GET /api/health` | Liveness | public |

## Scheduled jobs & integrations

- **Deadline sweep** — `POST /api/cron/deadlines` with `Authorization: Bearer $CRON_SECRET`, or
  `npm run jobs:deadlines` from a server. It notifies about overdue and due-soon tasks, school
  follow-ups, approvals waiting too long and upcoming partnership renewals, and marks unpaid
  invoices overdue. It is idempotent (deduplicated notifications), so run it hourly or daily
  from any scheduler (cron, Vercel Cron, GitHub Actions, Cloud Scheduler).
- **Learner platform sync** — `POST /api/integrations/learner-platform/sync` with
  `Authorization: Bearer $LEARNER_PLATFORM_SYNC_TOKEN` and a JSON payload of plans, learners,
  subscriptions, payments and engagement (schema in
  `src/server/integrations/learner-platform/sync.ts`); records are upserted by external id.

## Testing & quality

```bash
npm run typecheck      # TypeScript, strict
npm run lint           # ESLint incl. React Compiler rules
npm test               # unit tests (node:test via tsx)
npm run build          # production build
```

Unit tests cover the projection model, CSV export safety (formula injection), SAST date
handling, RBAC invariants and password hashing. Every page was exercised in a real browser
(Playwright) for each relevant role, in both themes and at phone width, including denial paths.

## Known limitations

- **Learner data is a local read model.** Metrics come from tables seeded with demo data or
  filled by the sync endpoint; connecting to the live learner platform is still to do.
- **Local file storage.** Uploads are written to `STORAGE_DIR` on the server's disk; production
  on multiple instances or serverless needs the S3-style adapter (the interface is in place).
- **No email/SMS delivery.** Notifications are in-app only.
- **Single sign-on and MFA are not implemented** (password + session only).
- **Rate limiting is database-backed** — correct, but a shared cache (e.g. Redis) would be
  cheaper at scale.
- **Dashboard customisation** supports per-user widget visibility and order; drag-and-drop
  layouts and role defaults are not built.
- **Exports are CSV.** No PDF or Excel report generation.
- **Roles are code-defined.** The matrix is visible in the UI, but custom roles require a code
  change (by design, so access stays reviewable).

## Recommended next steps

1. Connect the real learner platform (implement `LearnerPlatformSource` or schedule the sync).
2. Move document storage to S3-compatible object storage with signed URLs and virus scanning.
3. Add email notifications (digest + urgent) and calendar invites (ICS) for meetings.
4. Add MFA (TOTP/WebAuthn) and optional Google Workspace SSO for staff accounts.
5. Schedule the deadline sweep in production and add monitoring/alerting (errors, slow queries).
6. Add Playwright end-to-end tests to CI for the critical flows (sign-in, approvals, uploads).
7. Remove the demo data (`npm run demo:remove`) before going live and create real users.
