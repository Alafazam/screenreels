# Publishing to npm

The package name on npm is `screenreel`. The `.github/workflows/publish.yml` workflow publishes it. The workflow uses npm trusted publishing (OIDC), so the repository keeps no npm token, and each version gets a provenance statement that links it to the commit and workflow run that built it.

## What the package contains

The `files` list in `package.json` keeps only what the CLI loads at run time:

| Path | Used by |
|---|---|
| `bin/`, `lib/` | The `screenreel` CLI. |
| `packages/core/`, `packages/capture/` | Capture and the `flow` commands inject these into the page. |
| `dist/projector/` | `screenreel projector install` copies this folder. |
| `templates/` | `screenreel init`. |
| `skills/` | AI tools that read the skills from `node_modules/screenreel/skills/`. |
| `CHANGELOG.md`, `NOTICE`, `THIRD_PARTY_NOTICES.txt` | Release notes, the Apache-2.0 notice, and the license text of the bundled Lucide icons. npm adds `README.md`, `LICENSE` and `package.json` itself. |

The examples, build scripts, tests and docs stay in the repository. To see the exact contents before a release, run:

```bash
npm pack --dry-run
```

FFmpeg is not a hard dependency. `@ffmpeg-installer/ffmpeg` and `@ffprobe-installer/ffprobe` are optional peer dependencies, so a Projector-only install does not download an FFmpeg build. See [Capture](../README.md#capture) for how capture finds the binaries.

## One-time setup

Do these steps once, before the first release from the workflow.

1. Sign in to npmjs.com with the account that will own the package. Turn on two-factor authentication.
2. Publish the first version by hand. npm cannot add a trusted publisher to a package that does not exist yet. From a clean checkout of `main`:

   ```bash
   pnpm install --frozen-lockfile
   pnpm build
   pnpm test
   npm publish --access public
   ```

   This version has no provenance statement, because only a CI publish can make one.
3. On npmjs.com, open the package, then **Settings → Trusted publishing**. Add a GitHub Actions publisher with these values (they are case-sensitive):
   - Organization or user: `Alafazam`
   - Repository: `screenreels`
   - Workflow filename: `publish.yml`
4. In the same settings page, set **Publishing access** to "Require two-factor authentication and disallow tokens". After this, only the workflow can publish without a 2FA prompt.

## Each release

1. Set the new version in `package.json`. Keep `packages/*/package.json` on the same version.
2. In `CHANGELOG.md`, rename `## Unreleased` to the new version.
3. Run `pnpm build` and commit `dist/` with the version change. The workflow fails if `dist/` does not match a fresh build.
4. Push to `main`.
5. On GitHub, create a release with the tag `v<version>` (for example `v0.4.0`) and publish it. The workflow then builds, tests, checks that the tag matches `package.json`, and publishes.

You cannot publish the same version number twice, even after an unpublish, and npm puts strict limits on unpublishing after 72 hours. Do a dry run first if you are not sure.

## Dry run

On GitHub, open **Actions → Publish to npm → Run workflow**. A manual run does every step, then runs `npm publish --dry-run`, which prints the package contents and sends nothing to the registry.
