# Publishing Terminator (Windows)

## Local Build

```bash
bun run dist:win
```

Output: `dist/Terminator Setup <version>.exe`

Recommended release flow:

1. `bun run build` to validate compile first
2. `bun run dist:win` to package installer
3. verify artifact:
   - `dist/Terminator Setup <version>.exe`
   - `dist/Terminator Setup <version>.exe.blockmap`
   - `dist/win-unpacked/Terminator.exe`

If the installed app still looks like an old build:

1. close Terminator completely
2. run the latest `dist/Terminator Setup <version>.exe`
3. launch again from the updated install

## GitHub Actions Release

Tag and push to trigger a release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The release workflow builds the Windows installer and attaches `dist/*.exe` to the GitHub Release.
