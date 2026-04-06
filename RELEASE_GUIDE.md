# Collings AI — Release & Update Guide

This guide explains the full process from making code changes to users receiving
the update automatically inside the app.

---

## How It All Works (Big Picture)

```
You change code → bump version → build installer → upload to GitHub Release
                                                              ↓
                              User opens app → app checks GitHub → sees new version
                                                              ↓
                                              Blue banner appears: "Restart & Update"
                                                              ↓
                                              User clicks → app updates silently
```

---

## First Time Setup (Do This Once)

### 1 — Create a GitHub Personal Access Token

This allows your build tool to talk to GitHub automatically in the future.

1. Go to **github.com → click your profile photo → Settings**
2. Scroll down to **Developer settings** (bottom of left sidebar)
3. Click **Personal access tokens → Tokens (classic)**
4. Click **Generate new token (classic)**
5. Give it a name like `Collings AI Release`
6. Under **Scopes**, check only **`repo`**
7. Click **Generate token**
8. **Copy the token** — you only see it once

### 2 — Save the token on your computer

Open a terminal and run this (replace with your actual token):

```bash
setx GH_TOKEN "your_token_here"
```

Then **close and reopen your terminal** so the variable loads.

### 3 — Update the dist script in desktop/package.json

Change the `dist` script to this so it auto-uploads to GitHub:

```json
"dist": "vite build && ./node_modules/.bin/electron-builder --publish always && node scripts/stamp-icon.js"
```

---

## Every Time You Release a New Version

Follow these steps in order every time you want to push an update to users.

---

### Step 1 — Make your code changes

Make whatever changes, bug fixes, or new features you want in the codebase.

---

### Step 2 — Bump the version number

Open `desktop/package.json` and increase the version number.

**Rules:**
- Bug fix only → increase the last number: `1.1.0` → `1.1.1`
- New feature → increase the middle number: `1.1.0` → `1.2.0`
- Major rewrite → increase the first number: `1.1.0` → `2.0.0`

```json
{
  "name": "collings-ai-desktop",
  "version": "1.2.0",   ← change this
  ...
}
```

---

### Step 3 — Build the installer

Open a terminal in the `desktop/` folder:

```bash
cd "c:/Users/wally/OneDrive/Desktop/Collings AI/desktop"
npm run dist
```

This will:
- Build the React UI
- Package it into a Windows installer `.exe`
- Generate `latest.yml` with the new version number
- **Automatically upload all 3 files to a new GitHub Release** (if GH_TOKEN is set)

The build takes a few minutes. When it finishes, check `dist-installer/` to confirm:
- `Collings AI Setup 1.2.0.exe`
- `Collings AI Setup 1.2.0.exe.blockmap`
- `latest.yml` (contains `version: 1.2.0` inside)

---

### Step 4 — Create the GitHub Release (if not auto-uploaded)

> Skip this step if you set up GH_TOKEN — it was done automatically.

If you did NOT set up GH_TOKEN, do this manually:

1. Go to **github.com/Walls2002/Collings-AI → Releases**
2. Click **Draft a new release**
3. Click **Choose a tag** → type `v1.2.0` → click **Create new tag: v1.2.0**
4. Set the title to `v1.2.0`
5. Drag and drop these 3 files from `dist-installer/`:
   - `Collings AI Setup 1.2.0.exe`
   - `Collings AI Setup 1.2.0.exe.blockmap`
   - `latest.yml`
6. Make sure **"Set as the latest release"** is checked (NOT pre-release)
7. Click **Publish release**

---

### Step 5 — Push your code changes to GitHub

After releasing, commit and push the code changes too:

```bash
cd "c:/Users/wally/OneDrive/Desktop/Collings AI"
git add desktop/package.json
git commit -m "Release v1.2.0"
git push origin main
```

---

## What Happens on the User's Side

| Event | What the user sees |
|---|---|
| User opens app, new version exists | Blue banner at top: *"A new update is downloading..."* |
| Download finishes (background) | Banner changes to *"Restart & Update"* button |
| User clicks the button | App closes, installs silently, reopens at new version |
| User never clicks the button | App stays on old version until they restart manually |

The update check happens **automatically every time the app is opened.**
The user does not need to do anything except click the button when it appears.

---

## What latest.yml Is and Why It Matters

`latest.yml` is a small text file that looks like this:

```yaml
version: 1.2.0
files:
  - url: Collings AI Setup 1.2.0.exe
    sha512: abc123...
    size: 82000000
path: Collings AI Setup 1.2.0.exe
sha512: abc123...
releaseDate: '2026-04-05T00:00:00.000Z'
```

When a user opens the app, `electron-updater` fetches this file from your
GitHub Release and checks:

> "The installed version is 1.1.0. latest.yml says 1.2.0 is available. Show the update banner."

**You never edit this file manually.** It is always generated fresh by
`npm run dist` with the correct version, file size, and checksum.

---

## Quick Reference Checklist (Every Release)

```
[ ] 1. Make code changes
[ ] 2. Bump "version" in desktop/package.json
[ ] 3. Run: npm run dist  (inside desktop/ folder)
[ ] 4. Confirm dist-installer/ has the .exe, .blockmap, and latest.yml
[ ] 5. If GH_TOKEN not set: manually upload 3 files to a new GitHub Release
[ ] 6. Mark the release as "Latest release" (not pre-release)
[ ] 7. Commit and push: git add . && git commit -m "Release vX.X.X" && git push
[ ] 8. Done — users will get the update banner next time they open the app
```

---

## Common Mistakes to Avoid

| Mistake | What goes wrong |
|---|---|
| Forgetting to bump the version | `latest.yml` still says old version — no update triggered |
| Uploading without `latest.yml` | App cannot detect any update |
| Marking release as Pre-release | `electron-updater` ignores pre-releases by default |
| Editing `latest.yml` by hand | Checksum mismatch — update will fail to install |
