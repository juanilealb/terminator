# Publishing Constellagent (Windows)

## Local Build

```bash
bun run dist:win
```

Output: `dist/Constellagent Setup <version>.exe`

## GitHub Actions Release

Tag and push to trigger a release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The release workflow builds the Windows installer and attaches `dist/*.exe` to the GitHub Release.
