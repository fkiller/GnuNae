# AppX Assets for Microsoft Store

This folder contains assets required for Windows AppX/MSIX packaging.

## Required Assets

Create the following assets from your main `gnunae.png`:

| Asset | Size | Description |
|-------|------|-------------|
| `StoreLogo.png` | 50x50 | Store listing logo |
| `Square150x150Logo.png` | 150x150 | Medium tile |
| `Square44x44Logo.png` | 44x44 | Small tile/taskbar |
| `Wide310x150Logo.png` | 310x150 | Wide tile |

## Optional Assets

| Asset | Size | Description |
|-------|------|-------------|
| `LargeTile.png` | 310x310 | Large tile |
| `SmallTile.png` | 71x71 | Small tile |
| `SplashScreen.png` | 620x300 | Splash screen |
| `BadgeLogo.png` | 24x24 | Badge notifications |

## Generation

Run the icon generator script to regenerate `assets/gnunae.ico` (with valid 32-bit BGRA alpha and 1-bit AND masks) and all transparent APPX tile, scale (`.scale-125`..`.scale-400`), and taskbar unplated/lightunplated (`.targetsize-*`) assets from `assets/gnunae.png`:

```bash
node scripts/generate-appx-icons.js
```

Note: `package.json` configures `build.appx.backgroundColor` as `"transparent"` and `Square44x44Logo.targetsize-*` / `.scale-*` assets trigger `makepri.exe` (`resources.pri`) during `electron-builder --win appx` so Microsoft Store and Windows 10/11 dark & light taskbars render icons without a black background plate.
