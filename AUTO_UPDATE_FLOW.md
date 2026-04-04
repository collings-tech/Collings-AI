# Auto-Update Flow for Collings AI Desktop

## Overview

This document explains how in-app updates work for the Collings AI Electron desktop application — from publishing a new version to the user clicking "Update" inside the app.

---

## Where Updates Come From

You need a **public place to host your installer files**. The two most common options:

| Option | Best for |
|---|---|
| **GitHub Releases** | Free, simple, version-controlled |
| **Your own S3/server** | More control, private apps |

When you build a new version, `electron-builder` generates:
- The new `.exe` installer
- A `latest.yml` file (contains version number, file size, checksum)

The app fetches `latest.yml` from your host to know if a newer version exists.

---

## The Update Flow Step-by-Step

```
1. You build new version (e.g. v1.2.0) → produces .exe + latest.yml
         ↓
2. You upload those files to GitHub Releases (or S3)
         ↓
3. User opens the app → app silently calls the update server
         ↓
4. Server returns latest.yml → app compares versions:
   "I'm v1.1.0, server has v1.2.0 → update available"
         ↓
5. App shows "Update Available" banner/button in the UI
         ↓
6. User clicks "Update" → app downloads the new .exe in the background
         ↓
7. Download finishes → app shows "Restart to apply update"
         ↓
8. User clicks "Restart" → app closes, installer runs silently,
   app reopens at v1.2.0
```

---

## Implementation

### Step 1 — Install `electron-updater`

```bash
npm install electron-updater
```

> `electron-updater` is built to work with `electron-builder` and handles
> checking, downloading, and installing updates automatically.

---

### Step 2 — Add `publish` config to `package.json`

Tell `electron-builder` where you will host your update files.

```json
"build": {
  "appId": "com.collings.ai",
  "productName": "Collings AI",
  "publish": {
    "provider": "github",
    "owner": "your-github-username",
    "repo": "your-repo-name"
  }
}
```

> For a private S3 bucket, replace `"provider": "github"` with
> `"provider": "s3"` and add your bucket details.

---

### Step 3 — Add update logic to the Main Process

In `main/index.js`, wire up `autoUpdater` and forward events to the renderer:

```js
const { autoUpdater } = require('electron-updater');

// Check for updates silently when app starts
autoUpdater.checkForUpdatesAndNotify();

// Notify renderer that a new version is being downloaded
autoUpdater.on('update-available', () => {
  win.webContents.send('update-available');
});

// Notify renderer that the update is ready to install
autoUpdater.on('update-downloaded', () => {
  win.webContents.send('update-downloaded');
});

// Listen for the renderer's request to restart and install
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});
```

---

### Step 4 — Add Update UI to the Renderer

In your React app, listen for IPC events and show the appropriate UI:

```jsx
import { useEffect, useState } from 'react';

export default function UpdateBanner() {
  const [status, setStatus] = useState(null); // null | 'downloading' | 'ready'

  useEffect(() => {
    window.electron.ipcRenderer.on('update-available', () => {
      setStatus('downloading');
    });

    window.electron.ipcRenderer.on('update-downloaded', () => {
      setStatus('ready');
    });
  }, []);

  if (!status) return null;

  return (
    <div className="update-banner">
      {status === 'downloading' && (
        <p>Downloading update...</p>
      )}
      {status === 'ready' && (
        <button onClick={() => window.electron.ipcRenderer.send('install-update')}>
          Restart & Update
        </button>
      )}
    </div>
  );
}
```

Place `<UpdateBanner />` at the top level of your app layout so it appears across all pages.

---

### Step 5 — Release a New Version

Every time you want to push an update to users:

1. Bump the version in `package.json`:
   ```json
   "version": "1.2.0"
   ```

2. Build the installer:
   ```bash
   npm run dist
   ```
   This produces files in `dist-installer/`.

3. Upload to GitHub Releases:
   - Create a new release tagged `v1.2.0`
   - Attach the `.exe` and `latest.yml` from `dist-installer/`

4. Users will receive the update automatically the next time they open the app.

---

## Where to Place the Update Button in the UI

| Placement | Description |
|---|---|
| **Top banner** | Appears only when an update is ready — non-intrusive, hard to miss |
| **Settings / About page** | Add a "Check for Updates" button for manual checks |
| **System tray menu** | Right-click the tray icon → "Check for Updates" |

**Recommended:** A top banner that only appears after `update-downloaded` fires,
with a single "Restart & Update" button.

---

## Summary

| Who does what | Action |
|---|---|
| **You (developer)** | Build new version, upload to GitHub Releases |
| **`electron-updater`** | Checks server, downloads update silently |
| **User** | Sees banner, clicks "Restart & Update" |
| **Installer** | Runs silently, reopens app at new version |
