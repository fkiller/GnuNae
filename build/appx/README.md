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

## Quick Generation (macOS)

```bash
cd /Users/wondong/Projects/GnuNae
sips -z 50 50 assets/gnunae.png --out build/appx/StoreLogo.png
sips -z 150 150 assets/gnunae.png --out build/appx/Square150x150Logo.png
sips -z 44 44 assets/gnunae.png --out build/appx/Square44x44Logo.png
sips -z 310 150 assets/gnunae.png --out build/appx/Wide310x150Logo.png
```

Note: For Wide310x150Logo, you may want to create a proper wide version manually.
