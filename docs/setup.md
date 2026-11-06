# Local Development Setup

This guide takes you from zero to a running BS23 Training Workspace on your own machine:
website + API + database + Redis.

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

### Windows

Use **WSL2 (Ubuntu)**, not plain Windows. Run all commands inside the Ubuntu terminal.

1. Install WSL2: open PowerShell as Administrator → `wsl --install` → restart.
2. Install **Docker Desktop for Windows** and enable *Use the WSL 2 based engine*.
3. Inside Ubuntu, install Git, [fnm](https://github.com/Schniz/fnm#installation),
   [pnpm](https://pnpm.io/installation) and [GitHub CLI](https://github.com/cli/cli#installation)
   following each tool's Linux instructions. Use the bash version of the fnm line:
   `eval "$(fnm env --use-on-cd --shell bash)"` in `~/.bashrc`.
4. Keep the project **inside the Linux file system** (e.g. `~/projects`), not under `/mnt/c/...`.
   Under `/mnt/c` everything is much slower.

> ⚠ The Windows steps have not been tested on a team machine yet. If something here is wrong,
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

## 4. Install dependencies

```bash
pnpm install
```

Always use **pnpm**. Never run `npm install` or `yarn` in this repo.

---

## 5. Start the database and Redis

Make sure **Docker Desktop is open** (whale icon in the menu bar / system tray), then:

```bash
pnpm infra:up
```

Both containers should end as **Healthy**. Other commands:

| Command | What it does |
|---|---|
| `pnpm infra:up` | Start Postgres + Redis |
| `pnpm infra:down` | Stop them (your data is kept) |
| `pnpm infra:logs` | Show their logs (Ctrl+C to exit) |

---

## 6. Create your local env files

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

The default values already match the Docker setup. **Never commit `.env` or `.env.local`.**
Git is set up to ignore them.

---

## 7. Run the apps

```bash
pnpm dev
```

Open in your browser:

- http://localhost:3000 → Next.js page ✅
- http://localhost:4000 → `Hello World!` ✅

Stop with **Ctrl+C**.

**🎉 Done.** Post a screenshot of both pages in the team group.

---

## Daily workflow (short version)

```bash
cd ~/projects/bs23-training-workspace
git checkout develop
git pull
pnpm install            # in case dependencies changed
pnpm infra:up           # if Docker containers are not running
git checkout -b feat/e04-your-task-name
pnpm dev
```

Full rules for branches, commits and PRs: [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Troubleshooting

**`node --version` shows the wrong version (not v26)**
fnm is not active in this terminal. Close the terminal completely, open a new one, `cd` into
the project, and check again. Run `which node`. The path should contain `fnm`.

**`failed to connect to the docker API` / `Cannot connect to the Docker daemon`**
Docker Desktop is not running. Open it (macOS: `open -a Docker`), wait until the whale icon
stops animating, then try again.

**`port is already allocated` when running `pnpm infra:up`**
Something else is already using port 5433 or 6379. Find it with:
```bash
lsof -i :5433 -i :6379      # macOS / Linux
```
Tell E11 what is listed before stopping anything.

**Port 3000 or 4000 already in use when running `pnpm dev`**
Another app (maybe an old `pnpm dev`) is still running. Close other terminals, or find it with
`lsof -i :3000 -i :4000`.

**Database connection / authentication errors from the API**
Check that `apps/api/.env` exists and that `DATABASE_URL` uses port **5433**. Port 5432 is often
used by a Postgres that is already installed on your machine, not our Docker one.

**pnpm warns that commands are "shadowed" or you have two pnpm versions**
Run `which -a pnpm`. If more than one path is listed, tell E11. The extra one has to be removed.

**Hydration warning in the browser mentioning `data-gr-ext-installed` or similar**
A browser extension (e.g. Grammarly) changed the page. It is not a bug in our code. Use an
incognito window or disable the extension for localhost.

**Something else**
Send E11 the command you ran, the **full** error output (as text, not only a photo), and your
OS.
