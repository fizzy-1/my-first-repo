# Integral Workspace Lite

A small team workspace for Integral Academy that runs on one of your own computers. It's built for a startup team of about 3–20 people, not a large company.

- **No installs beyond Node.js**: no database server, no `npm install`, no cloud account.
- **One folder holds everything**: all data lives in `data/` (a single SQLite file plus uploaded files). To back up, copy that folder.
- **Works on your office network**: one computer runs it, and everyone else opens it in a browser.

## What's inside

| Area | What it does |
|---|---|
| **Dashboard** | Cash and runway, unpaid and overdue invoices (managers), your tasks, overdue work, school follow-ups due this week, pending approvals, content progress, upcoming meetings, team activity |
| **Tasks** | List or board view; assign, prioritise, set due dates, tick off; weekly or monthly repeating tasks schedule their next copy automatically |
| **Goals** | Targets with deadlines and an on-track / at-risk / behind status against a straight-line pace. Most goals track themselves from the workspace (schools signed, learners, content published, new leads, income, recurring revenue); others are updated by hand with a short history |
| **Calendar** | Month view (agenda list on phones) of meetings, task deadlines, school follow-ups and content due dates; filter to just your own |
| **Schools pipeline** | Schools from first contact to signed, with deal value, learner numbers, follow-up dates, call notes and one-click follow-up tasks |
| **Contracts & renewals** | Each school's contract term and yearly value, annual recurring revenue, renewal rate, and the renewals that need a decision. 60 and 30 days before a contract ends the school's owner and the managers get a notification and a renewal task; renew or record "not renewing" in one click, or create the year's invoice from the contract |
| **Content** | Board for videos, lessons, worksheets, quizzes and past-paper memos: Idea → Recording → Editing → Review → Published |
| **Finance** *(managers)* | Tabs for **Overview** (cash, burn, runway, this month against budget), **Transactions** (CSV export), **Invoices**, **Budget** (a monthly amount per category, spending against it) and **Forecast** (cash month by month for the next 6–18 months from your contracts, other income and budget, with "what if we hire / earn more" inputs and the month cash would run out); **import a bank statement** (CSV from FNB, Standard Bank, Absa, Nedbank, Capitec and others), with rows already recorded skipped and categories reused from earlier transactions |
| **Invoices** *(managers, under Finance)* | Numbered invoices (INV-0001, INV-0002…) for schools, typed in or created from a contract with the school, amount and term filled in. Draft → Sent → Paid, or Void. Recording a payment adds the income to Transactions automatically. Managers get a notification when a sent invoice passes its due date. Print an invoice or save it as a PDF, with your company and bank details on it |
| **Stats** | A month-by-month matrix of the business (money for managers; recurring revenue, schools and learners under contract, leads, schools signed, content, tasks, meetings) with shading, trend lines and change, plus a team view of what each person is carrying. Export as CSV |
| **Monthly update** *(managers)* | One-page summary of the month: money, schools signed, content published, tasks done, approvals and key decisions. Copy it as text for an email, or print it / save as PDF |
| **Approvals** | Anyone can request spending approval. A manager approves or rejects it with a note. Nobody can approve their own request |
| **Meetings** | Notes and decisions. Action items become tasks on the team's list |
| **Documents** | Upload PDFs, images and Office files (up to 20 MB each). Files can be marked private |
| **Team & settings** | Invite people by their work email, set roles, send password reset links, deactivate leavers; set the company name, company email domain and starting bank balance; download a backup |

Also: **notifications** (the bell) tell people when they're assigned a task, when spending needs their decision, when their request is decided, when someone adds a note on their school, and when content is ready for review. **Search everything** from the top bar (or press <kbd>Ctrl</kbd>+<kbd>K</kbd> / <kbd>/</kbd>). The sidebar shows **badges** for your open tasks (red if any are overdue) and approvals waiting for a manager.

### Roles

| Role | Can do |
|---|---|
| **Member** | Everyday work: tasks, pipeline, content (up to *Review*), meetings, documents, their own approval requests |
| **Manager** | Everything a member can do, plus finance, deciding approvals, publishing content, and deleting records |
| **Admin** | Everything, plus managing people and workspace settings |

## Run it

1. Install **Node.js** from <https://nodejs.org>. Choose the LTS version: it needs 22.13 or newer, and the current LTS is newer than that.
2. Start the workspace:
   - **Windows**: double-click **`Start Workspace.bat`**.
   - **Mac**: double-click **`Start Workspace.command`**. The first time, macOS may block it. If so, right-click the file, choose **Open**, then confirm.
   - **Or from a terminal** in this folder, run `npm start`.

   A window opens showing the workspace's addresses. Keep it open while people use the workspace, and close it (or press Ctrl+C) to stop.
3. Your browser opens <http://localhost:3000>. The first visit asks you to create the admin account.
4. Add your team under **Team & settings** (see [Adding your team](#adding-your-team)). Each person gets a personal link and creates their own password.

### Try it with demo data first

```sh
npm run seed     # only works on an empty workspace
npm start
```

Sign in as `sipho@integralacademy.co.za` (admin), `ayesha@integralacademy.co.za` (manager) or `nomvula@integralacademy.co.za` (member). The password for all of them is `integral-demo-2026`.

When you're ready to use it for real, stop the server, delete the `data` folder and start again.

### Start it automatically when the computer turns on

- **Windows**: press <kbd>Win</kbd>+<kbd>R</kbd>, type `shell:startup` and press Enter. Then right-click inside that folder, choose **New → Shortcut**, and point it at `Start Workspace.bat`.
- **Mac**: open System Settings → General → Login Items, click **+** under "Open at Login", and choose `Start Workspace.command`.

Also stop the computer from going to sleep during working hours, or the workspace goes offline with it.

## Using it from other computers

The server listens on your whole local network, and the start window prints the address to share, for example `http://192.168.1.20:3000`. Teammates open that address in their browser.

If you need to find the address yourself: on Windows run `ipconfig` and look for the IPv4 address; on a Mac open System Settings → Network. The first time it starts, Windows asks whether to let Node.js use the network. Tick **Private networks** and click **Allow**. If teammates still can't connect, check the firewall on that computer and make sure everyone is on the same Wi-Fi or office network. Keep the computer on (and awake) during working hours.

**Keep it on your private network.** Don't expose port 3000 to the internet directly. If the team needs remote access, use a private network tool such as Tailscale, or put it behind an HTTPS reverse proxy and start it with `COOKIE_SECURE=true`.

## Backups

All data is in the `data` folder.

**Easy way:** an admin clicks **Team & settings → Download backup**. You get a single `.zip` containing a safe copy of the database and every uploaded file, which you can store in cloud storage or on a USB drive. If you haven't backed up for a week, the dashboard reminds admins.

**Manual way:** stop the server and copy the `data` folder. Use this if the workspace grows past 1 GB, which is too large for the download button.

To restore: stop the server, unzip the backup inside this folder (it contains a `data` folder that replaces the current one), and start the server again.

## Updating to a new version

Download a backup first, then replace every file in this folder except the `data` folder, and start the workspace again. Your data stays, and the database upgrades itself automatically.

## Settings

All settings are optional environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `HOST` | `0.0.0.0` | Use `127.0.0.1` to allow this computer only |
| `DATA_DIR` | `./data` | Where the database and uploads are stored |
| `COOKIE_SECURE` | `false` | Set to `true` when serving over HTTPS |
| `PUBLIC_URL` | *(network address)* | The address teammates use, for invite and reset links, e.g. `https://workspace.integralacademy.co.za` |

## Adding your team

Everyone signs in with their **work email** (for example `thabo@integralacademy.co.za`) and **a password they create themselves**. The admin never sets or sees anyone's password.

1. An admin opens **Team & settings → Add person** and enters the person's name, work email and role.
2. The workspace shows a personal **invite link**. Click **Email it** to send it from your own email, or **Copy link** to send it on WhatsApp or Teams.
3. The person opens the link, sees their email, creates a password (at least 10 characters, with letters and a number) and is signed in. You get a notification when they've joined.
4. From then on they sign in with their work email and that password.

Invite links work once and expire after 7 days. Until someone joins, the Team list shows them as **Invited**. To send a fresh link, click their row and choose **New invite link**; any earlier link stops working.

**Only company emails.** Under **Workspace settings**, **Company email domain** (for example `integralacademy.co.za`) limits the team to addresses at that domain. It's filled in automatically from the first admin's email, unless that's a personal address such as Gmail. Leave it empty to allow any email.

**Forgotten passwords.** An admin clicks the person's row and chooses **Password reset link**, then sends it the same way. The link works once, for 2 days. The old password keeps working until they choose a new one, and choosing one signs them out everywhere else.

**The link's address.** When you add people on the computer running the workspace, links use its network address (the one the start window shows), so they open on teammates' computers. If the team reaches the workspace another way, such as through Tailscale or a web address, set `PUBLIC_URL` to that address (see [Settings](#settings)).

## Signing in

- The sign-in page remembers your email on that computer, so next time you only type your password.
- **Keep me signed in** (ticked by default) keeps you signed in for 14 days. Untick it on a shared computer: you're signed out when the browser closes.
- **My account → Where you're signed in** lists every computer and phone signed in to your account, with when each was last used. Sign out one you no longer use, or all of them except the one you're on.

## Security notes

- Passwords are hashed with scrypt. Sessions last up to 14 days, and changing a password signs out the account's other devices.
- Repeated failed sign-ins are slowed down: an account locks for 15 minutes after 5 wrong passwords.
- Every permission check runs on the server; the browser only hides buttons.
- Members can't see finance, other people's approval requests, private documents, or money-related activity.
- Everyone creates their own password from a one-time invite link, so no admin ever knows it. Links are stored only as a fingerprint (hash), expire, and stop working once used or when a newer one is made.
- If someone forgets their password, an admin sends them a one-time reset link from **Team & settings**.
- With a company email domain set, only addresses at that domain can be added to the team.

## Online preview

`preview/` holds a version of the app that runs entirely in a web browser, for showing people the workspace without installing anything. It uses the same screens as the real app with demo data. A stand-in for the server (`preview/mock-api.js`) answers requests inside the browser and follows the same permission rules. A "Preview" bar lets you switch between the demo accounts, reset the data, or start empty to see first-time setup. Changes stay in that browser only, and files can be viewed but not downloaded.

To rebuild the preview page after changing `public/index.html`, run `node preview/build.mjs`.

The calculations for goals, renewals, budgets, the forecast and stats live in `public/metrics.js`, and the demo story in `preview/demo-data.js`. The server, `seed.js` and the preview all use these same files, so the numbers always agree.

**School income in the forecast** comes from the contracts, so record school payments under the category "School contracts". That way they aren't counted twice.

## Hosted on claude.ai (no computer needed)

`preview/hosted.html` is the same app running as a claude.ai artifact, with the team's real data in the artifact's shared database:

- **Signing in:** people use their claude.ai accounts; there are no passwords. The sign-in page shows who you are and your role, then **Continue to the workspace**. The first time, the owner sets the company name and starting bank balance there, and everyone else chooses the name the team sees. Signing out returns to that page.
- **Roles come from the Share menu:** the Owner is the admin, an **Editor** is a manager, and a **Contributor** (where your plan offers it) is a member. Viewers can't use the workspace.
- **Finance is protected by claude.ai itself:** transactions, invoices, budgets, the opening balance, private files and money-related activity live under `money/` in the database, which only Editors and the Owner can read or write.
- **Live:** changes from other people appear without reloading. Exports, document files and backups are saved through claude.ai's download prompt.
- **Limits:** files up to 5 MB each, and 25 000 database records in total (years of use for a small team). The backup is a `.json` file of every record; uploaded files aren't inside it.
- **Privacy:** spending requests and notifications are stored where every member can technically read them, although the app only shows people their own. Don't put anything secret in them.

To publish it, run `node preview/build.mjs`. Then publish `hosted.html` with `hosted.js`, `mock-api.js`, `icons.js`, `metrics.js`, `ui.js`, `app.js` and `crest.png`, declaring the `db` capability (rules: root `read/write: interact`, `money` `read/write: admin`), `user` (scope `profile`) and `downloads`.

## How it's built

- `server.js`: the HTTP server and the whole API, including validation and permission rules.
- `db.js`: the database schema (Node's built-in SQLite).
- `passwords.js`: password hashing.
- `seed.js`: optional demo data.
- `Start Workspace.bat` / `Start Workspace.command`: double-click launchers that check Node.js, start the server and open the browser.
- `public/`: the browser app (React and htm, vendored locally so it works offline), `ui.js` (components and charts) and `app.js` (screens).

There's no build step. Edit a file and restart the server to see the change.
