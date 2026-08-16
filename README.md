# Kutty Couture Inventory

Windows desktop inventory and billing app built with React and Electron.

## Prerequisites

- Node.js and npm installed
- Windows machine for creating/testing the Windows EXE
- Dependencies installed with:

```powershell
npm install
```

For clean/reproducible installs, use:

```powershell
npm ci
```

If `npm ci` fails with an `EPERM unlink ... electron ... dll` error, close any running app windows from `dist\win-unpacked` or Electron development windows, then run it again.

## Run the Windows Desktop App

```powershell
npm run desktop
```

This builds the React renderer and opens it only through Electron; the project
does not include a browser development server.

## Build React Production Files

```powershell
npm run build
```

This creates the React production output in `build\`.

Important packaging notes:

- `homepage` is set to `"./"` so packaged Electron can load React assets through `file://`.
- The app uses `HashRouter`, which works correctly inside the packaged Windows app.

## Build Windows EXE

Before building, close any running `Kutty Couture.exe` from `dist\win-unpacked`.

Create the unpacked Windows app:

```powershell
npx electron-builder --dir
```

Output:

```text
dist\win-unpacked\Kutty Couture.exe
```

This is the best build to test locally while developing.

## Build Windows Installer

Create the NSIS installer:

```powershell
npm run dist:win
```

Expected output:

```text
dist\Kutty Couture Setup <version>.exe
```

If the installer build fails because Windows cannot create symbolic links while extracting `winCodeSign`, enable Developer Mode in Windows or run the terminal as Administrator. The project currently disables executable signing/editing for local unsigned builds with:

```json
"signAndEditExecutable": false
```

## Common Build Issues

### EXE says it cannot find `electron.js`

The packaged app must point to the root Electron entry file. This repo sets:

```json
"extraMetadata": {
  "main": "electron.js"
}
```

### EXE opens but React components do not render

Make sure `homepage` remains:

```json
"homepage": "./"
```

Then rebuild:

```powershell
npm run build
npx electron-builder --dir
```

### Build folder or dist folder has stale files

Close the EXE first, then clean/rebuild:

```powershell
npm run clean
npm run build
npx electron-builder --dir
```

## Useful Scripts

```text
npm run desktop  Build and open the Electron desktop app
npm run build   React production build
npm run clean   Remove dist folder
npm run dist:win Build Windows NSIS installer
npm run pack:win Build portable Windows package
```
