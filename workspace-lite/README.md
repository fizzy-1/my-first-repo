# Integral Workspace Lite

A small team workspace for Integral Academy that runs on one of your own computers. It's built for a startup team of about 3–20 people, not a large company.

- **No installs beyond Node.js**: no database server, no `npm install`, no cloud account.
- **One folder holds everything**: all data lives in `data/` (a single SQLite file plus uploaded files). To back up, copy that folder.
- **Works on your office network**: one computer runs it, and everyone else opens it in a browser.

## What's inside

| Area | What it does |
|---|---|
| **Dashboard** | Cash and runway (managers), your tasks, overdue work, school follow-ups due this week, pending approvals, content progress, upcoming meetings, team activity |
| **Tasks** | List or board view; assign, prioritise, set due dates, tick off; weekly or monthly repeating tasks schedule their next copy automatically |
| **Goals** | Targets with deadlines and an on-track / at-risk / behind status against a straight-line pace. Most goals track themselves from the workspace (schools signed, learners, content published, new leads, income, recurring revenue); others are updated by hand with a short history |
| **Calendar** | Month view (agenda list on phones) of meetings, task deadlines, school follow-ups and content due dates; filter to just your own |
| **Schools pipeline** | Schools from first contact to signed, with deal value, learner numbers, follow-up dates, call notes and one-click follow-up tasks |
| **Contracts & renewals** | Each school's contract term and yearly value, annual recurring revenue, renewal rate, and the renewals that need a decision. 60 and 30 days before a contract ends the school's owner and the managers get a notification and a renewal task; renew or record "not renewing" in one click |
| **Content** | Board for videos, lessons, worksheets, quizzes and past-paper memos: Idea → Recording → Editing → Review → Published |
| **Finance** *(managers)* | Tabs for **Overview** (cash, burn, runway, this month against budget), **Transactions** (CSV export), **Budget** (a monthly amount per category, spending against it) and **Forecast** (cash month by month for the next 6–18 months from your contracts, other income and budget, with "what if we hire / earn more" inputs and the month cash would run out); **import a bank statement** (CSV from FNB, Standard Bank, Absa, Nedbank, Capitec and others), with rows already recorded skipped and categories reused from earlier transactions |
| **Stats** | A month-by-month matrix of the business (money for managers; recurring revenue, schools and learners under contract, leads, schools signed, content, tasks, meetings) with shading, trend lines and change, plus a team view of what each person is carrying. Export as CSV |
| **Monthly update** *(managers)* | One-page summary of the month: money, schools signed, content published, tasks done, approvals and key decisions. Copy it as text for an email, or print it / save as PDF |
| **Approvals** | Anyone can request spending approval. A manager approves or rejects it with a note. Nobody can approve their own request |
| **Meetings** | Notes and decisions. Action items become tasks on the team's list |
| **Documents** | Upload PDFs, images and Office files (up to 20 MB each). Files can be marked private |
| **Team & settings** | Add people, set roles, reset passwords, deactivate leavers; set the company name and starting bank balance; download a backup |

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
4. Add your team under **Team & settings**, and give each person a temporary password privately. They must choose their own password the first time they sign in.

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

## Security notes

- Passwords are hashed with scrypt. Sessions last 14 days, and changing a password signs out the account's other devices.
- Repeated failed sign-ins are slowed down: an account locks for 15 minutes after 5 wrong passwords.
- Every permission check runs on the server; the browser only hides buttons.
- Members can't see finance, other people's approval requests, private documents, or money-related activity.
- Passwords set by an admin are temporary. The person must choose their own at their next sign-in, so the admin never knows it.
- If someone forgets their password, an admin sets a new temporary one under **Team & settings**.

## Online preview

`preview/` holds a version of the app that runs entirely in a web browser, for showing people the workspace without installing anything. It uses the same screens as the real app with demo data. A stand-in for the server (`preview/mock-api.js`) answers requests inside the browser and follows the same permission rules. A "Preview" bar lets you switch between the demo accounts, reset the data, or start empty to see first-time setup. Changes stay in that browser only, and files can be viewed but not downloaded.

To rebuild the preview page after changing `public/index.html`, run `node preview/build.mjs`.

The calculations for goals, renewals, budgets, the forecast and stats live in `public/metrics.js`, and the demo story in `preview/demo-data.js`. The server, `seed.js` and the preview all use these same files, so the numbers always agree.

**School income in the forecast** comes from the contracts, so record school payments under the category "School contracts". That way they aren't counted twice.

## How it's built

- `server.js`: the HTTP server and the whole API, including validation and permission rules.
- `db.js`: the database schema (Node's built-in SQLite).
- `passwords.js`: password hashing.
- `seed.js`: optional demo data.
- `Start Workspace.bat` / `Start Workspace.command`: double-click launchers that check Node.js, start the server and open the browser.
- `public/`: the browser app (React and htm, vendored locally so it works offline), `ui.js` (components and charts) and `app.js` (screens).

There's no build step. Edit a file and restart the server to see the change.
