# Local Development Setup

This guide takes you from zero to a running BS23 Training Workspace on your own machine:
website + API + database (with demo data) + Redis.

**Time needed:** about 30–60 minutes the first time (mostly downloads).

If you get stuck, check [Troubleshooting](#troubleshooting) first, then ask E11 (DevOps) with
a screenshot of the full error.

---

## What you will run

| Part | Folder | URL / Port | What it is |
|---|---|---|---|
| Web | `apps/web` | http://localhost:3000 | Next.js frontend |
| API | `apps/api` | http://localhost:4000 | NestJS backend |
| Postgres 18 | Docker | `localhost:5433` | Main database (port **5433**, not 5432) |
| Redis 8 | Docker | `localhost:6379` | Cache and job queue |

---

## 1. Install the tools (one time)

You need: **Git, fnm (Node version manager), pnpm, Docker Desktop, GitHub CLI**.

### macOS

Install [Homebrew](https://brew.sh) if you don't have it, then:

```bash
brew install git fnm pnpm gh
brew install --cask docker
```

Turn on automatic Node switching (fnm reads our `.nvmrc` file):

```bash
echo 'eval "$(fnm env --use-on-cd --shell zsh)"' >> ~/.zshrc
source ~/.zshrc
```

### Windows (Git Bash)

Use **Git Bash** for every command in this guide. PowerShell is needed once (step 2); Ubuntu/WSL
is not needed.

1. Install **Git for Windows** (git-scm.com). At the line-ending question choose
   *Checkout as-is, commit Unix-style line endings*. Git Bash comes with it.
2. Install **Docker Desktop** (docker.com), restart, and keep Docker Desktop open while you work.
   Then, in **PowerShell**, once:
   ```powershell
   winget install Schniz.fnm
   winget install GitHub.cli
   ```
3. Open **Git Bash** (Start menu) and run:
   ```bash
   echo 'eval "$(fnm env --use-on-cd --shell bash)"' >> ~/.bashrc
   source ~/.bashrc
   fnm install 26 && fnm default 26
   npm install -g pnpm@12.16.1
   git config --global core.autocrlf false
   ```
   `core.autocrlf false` stops Git from changing line endings, which would otherwise show every
   file as modified and break lint.
4. In VS Code, make Git Bash the default terminal: **Ctrl + Shift + P** →
   *Terminal: Select Default Profile* → **Git Bash**.

`~/projects` in Git Bash is `C:\Users\<you>\projects`. If Docker Desktop reports a WSL error, run
`wsl --update` in PowerShell.

> ⚠ These Windows steps have not been tested on a team machine yet. If something here is wrong,
> tell E11 so this guide can be fixed.

### Linux

Install Git, fnm, pnpm, GitHub CLI and Docker Engine (with the Compose plugin) using each
tool's official instructions. Add your user to the `docker` group so you don't need `sudo`.

### Check everything

Open a **new** terminal window, then:

```bash
git --version
fnm --version
pnpm --version
docker --version
docker compose version
gh --version
```

Every command should print a version. "command not found" means that tool is not installed
or not on your PATH.

---

## 2. Set up Git and GitHub (one time)

```bash
git config --global user.name "Your Name"
git config --global user.email "the-email-you-use-on-github@example.com"
gh auth login
```

For `gh auth login` choose: **GitHub.com → HTTPS → Yes → Login with a web browser**.

Accept the repository invitation from `bs23-training-team` (check your email or GitHub
notifications) before cloning.

---

## 3. Get the code

```bash
mkdir -p ~/projects && cd ~/projects
gh repo clone bs23-training-team/bs23-training-workspace
cd bs23-training-workspace
```

Install the Node version the project uses (from `.nvmrc`) and check it:

```bash
fnm install
fnm use
node --version
```

`node --version` must start with **v26**.

---

## 4. One-command setup

Make sure **Docker Desktop is open** (whale icon in the menu bar / system tray stops animating), then:

```bash
git checkout develop
git pull
pnpm setup:local
```

`pnpm setup:local` (`scripts/setup-local.sh`) does everything in order:

1. installs dependencies exactly as locked (`pnpm install --frozen-lockfile`)
2. creates `apps/api/.env` from `apps/api/.env.example` if it does not exist yet
3. starts Postgres 18 and Redis 8 in Docker (`pnpm infra:up`)
4. creates the database tables (`pnpm db:deploy`)
5. generates the Prisma client (`pnpm db:generate`)
6. adds demo data (`pnpm db:seed`)

It ends with `Done. Start the apps with: pnpm dev`. It is safe to run again: the seed never creates
duplicates. Always use **pnpm**; never run `npm install` or `yarn` in this repo.

---

## 5. Create the web env file

`setup:local` creates only the API file. Create the web one by hand, once:

```bash
cp -n apps/web/.env.example apps/web/.env.local
```

The default values already match the Docker setup. **Never commit `.env` or `.env.local`.**
Git is set up to ignore them.

---

## 6. Run and check

```bash
pnpm dev
```

Open in your browser:

- http://localhost:3000 → Next.js page
- http://localhost:4000 → `Hello World!`
- http://localhost:4000/health/ready → status `ok` (the API can reach the database)

In a second terminal, check the database:

```bash
pnpm db:status
```

`Database schema is up to date!` means every migration has run. Stop the apps with **Ctrl+C**.

**Done.** Post a screenshot of the pages in the team group.

### Demo accounts (local only)

All demo accounts use the password `Password123!`. Never use it anywhere real.

| Account | Logs in with | Type |
|---|---|---|
| PM001, PM002 | `pm001@bs23.test`, `pm002@bs23.test` | PM |
| BS23001 | `BS23001` | TRAINEE |
| BS23002 | `BS23002` | CENTRAL_LND |
| BS23003 | `BS23003` | INDUSTRIAL_ATTACHMENT |
| BS23004 | `BS23004` | SBU |

The seed also creates the workspace `bs23`, a team, 6 skills, an XP rule and 2 levels. Login itself is
built by E01; until it is merged these accounts are only rows in the database.

---

## Daily workflow (short version)

Start every new task like this:

`pnpm setup:local` picks up new dependencies and other people's migrations.

```bash
cd ~/projects/bs23-training-workspace
git checkout develop
git pull
pnpm setup:local
git checkout -b feat/e04-your-task-name
pnpm dev
```

Rules for branches, commits and PRs: [CONTRIBUTING.md](../CONTRIBUTING.md). The step-by-step task flow
(rehearsal branch, testing with seed data, push) is in the team beginner guide shared by E11.

### Useful commands

| Command | What it does |
|---|---|
| `pnpm setup:local` | full local setup (install, Docker, migrations, client, seed) |
| `pnpm infra:up` / `pnpm infra:down` | start / stop Postgres + Redis (data is kept) |
| `pnpm infra:logs` | show their logs (Ctrl+C to exit) |
| `pnpm dev` | run web + API with auto-reload |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` | the same checks CI runs |
| `pnpm --filter api test:e2e` | API tests that need the local database |
| `pnpm db:status` | are all migrations applied? |
| `pnpm db:studio` | browse the local database in the browser |
| `pnpm db:seed` | add the demo data again |

### Start the database from scratch

Deletes only your local test data:

```bash
docker compose -f infra/docker-compose.yml down -v
pnpm setup:local
```

Never run this, or any migration or seed, against a Neon / staging / production database.

---

## Troubleshooting

**`node --version` shows the wrong version (not v26)**
fnm is not active in this terminal. Close the terminal completely, open a new one, `cd` into
the project, and check again. Run `which node`. The path should contain `fnm`.

**`failed to connect to the docker API` / `Cannot connect to the Docker daemon`**
Docker Desktop is not running. Open it (macOS: `open -a Docker`), wait until the whale icon
stops animating, check with `docker info`, then run `pnpm setup:local` again.

**`P1001: Can't reach database server at localhost:5433`**
Postgres is not running. Open Docker Desktop, run `pnpm infra:up`, and check that `docker ps`
shows `bs23-postgres-1` as `healthy`.

**`pnpm db:status` says migrations "have not yet been applied", or `No migration found`**
Your database is behind `develop`. Run `pnpm setup:local`.

**TypeScript says `Property 'xyz' does not exist` on a Prisma model**
The Prisma client is old. Run `pnpm db:generate`.

**`port is already allocated` when Docker starts**
Something else is already using port 5433 or 6379. Find it with:
```bash
lsof -i :5433 -i :6379
```
(macOS / Linux.)
Tell E11 what is listed before stopping anything.

**Port 3000 or 4000 already in use when running `pnpm dev`**
Another app (maybe an old `pnpm dev`) is still running. Close other terminals, or find it with
`lsof -i :3000 -i :4000`.

**Database connection / authentication errors from the API**
Check that `apps/api/.env` exists and that `DATABASE_URL` uses port **5433**. Port 5432 is often
used by a Postgres that is already installed on your machine, not our Docker one.

**zsh error such as `cd: too many arguments` after pasting a command**
The pasted line ended with a `# comment`. Run it again without the `#` part.

**pnpm prints "Update available! 12.16.1 → …"**
Ignore it. Everyone stays on 12.16.1.

**pnpm warns that commands are "shadowed" or you have two pnpm versions**
Run `which -a pnpm`. If more than one path is listed, tell E11. The extra one has to be removed.

**Hydration warning in the browser mentioning `data-gr-ext-installed` or similar**
A browser extension (e.g. Grammarly) changed the page. It is not a bug in our code. Use an
incognito window or disable the extension for localhost.

**Something else**
Send E11 the command you ran, the **full** error output (as text, not only a photo), and your
OS.
