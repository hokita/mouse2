# GCP/Firebase Deployment — Design Spec

## Summary

mouse2 is currently a local-only Vite + Phaser static build with no deployment target. This spec sets up a Google Cloud environment for it — a dedicated GCP project with Firebase Hosting serving the built game, deployed automatically by GitHub Actions on push to `main`.

The pattern is deliberately borrowed from the `corgi` repository (see [`docs/superpowers/spec.md`](../spec.md) for the reference notes, and `corgi`'s `docs/superpowers/specs/2026-06-24-github-actions-cicd-design.md` for the original WIF script), scaled down to what mouse2 actually needs: a pure static frontend with no backend, auth, or database.

## Approach

mouse2 has no backend, so most of corgi's stack (Cloud Run, Artifact Registry, Firestore, Secret Manager) doesn't apply — only the Firebase Hosting + GitHub Actions half is relevant. Two decisions were confirmed with the user rather than left open:

- **CI/CD auth: Workload Identity Federation**, not a static Firebase CI token/service-account JSON secret. Mirrors corgi's explicitly-called-out pattern ("Workload Identity Federation over service-account keys... no static credentials stored in CI") — no long-lived credentials sit in GitHub Secrets.
- **Trigger: production-only deploy on push to `main`**, no PR preview channels. Mirrors corgi's `frontend.yml` exactly (path-filtered push to `main` + `workflow_dispatch`, no preview-channel job).

Two adaptations from corgi are necessary, not optional:
- **Package manager**: mouse2 uses pnpm (`packageManager: pnpm@11.18.0`, `pnpm-lock.yaml`), not npm — the workflow uses `pnpm/action-setup` + `pnpm install`/`pnpm test`/`pnpm run build` instead of `npm ci`.
- **No lint step**: mouse2 has no `lint` script or ESLint config (unlike corgi). The workflow runs only `test` and `build` (which itself runs `tsc --noEmit`). Adding lint tooling is out of scope for this deploy task.

## GCP / Firebase Project Setup (one-time, manual)

Requires the user's own `gcloud`/`firebase` CLI login — not something that can be scripted without their credentials.

1. `gcloud projects create mouse2` (or `mouse2-<suffix>` if the ID is taken — GCP project IDs are globally unique)
2. `firebase projects:addfirebase <project-id>` to link Firebase to the new GCP project
3. No billing account required — Firebase Hosting's free Spark plan covers a static game site at this scale

## Firebase Hosting Config

New files at repo root:

**`firebase.json`**
```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
  }
}
```
No SPA rewrite rule (unlike corgi) — mouse2 is a single-page Phaser canvas app with no client-side routing, so there are no alternate routes to rewrite to `index.html`.

**`.firebaserc`**
```json
{
  "projects": {
    "default": "<project-id>"
  }
}
```

## Workload Identity Federation Setup (one-time, manual)

Adapted from corgi's script (`docs/superpowers/specs/2026-06-24-github-actions-cicd-design.md` in the corgi repo), scoped down: no Cloud Run/Artifact Registry/Cloud Build roles, since mouse2 has no backend. Replace `<project-id>` throughout with the actual project ID chosen in the GCP project setup step above.

```bash
# 1. Enable required API
gcloud services enable iamcredentials.googleapis.com \
  --project=<project-id>

# 2. Create Workload Identity Pool
gcloud iam workload-identity-pools create "github-pool" \
  --project=<project-id> \
  --location="global" \
  --display-name="GitHub Actions Pool"

# 3. Create GitHub OIDC Provider inside the pool
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project=<project-id> \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="attribute.repository == 'hokita/mouse2'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# 4. Create service account
gcloud iam service-accounts create "github-actions-deploy" \
  --project=<project-id> \
  --display-name="GitHub Actions Deploy"

# 5. Grant the role needed for Firebase Hosting deploys
gcloud projects add-iam-policy-binding <project-id> \
  --member="serviceAccount:github-actions-deploy@<project-id>.iam.gserviceaccount.com" \
  --role="roles/firebasehosting.admin"

# 6. Allow the WIF pool to impersonate the service account,
#    scoped to only the hokita/mouse2 repository
gcloud iam service-accounts add-iam-policy-binding \
  "github-actions-deploy@<project-id>.iam.gserviceaccount.com" \
  --project=<project-id> \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$(gcloud projects describe <project-id> --format='value(projectNumber)')/locations/global/workloadIdentityPools/github-pool/attribute.repository/hokita/mouse2"

# 7. Output the WIF provider resource name (paste into GitHub Secret: WIF_PROVIDER)
echo "WIF_PROVIDER:"
echo "projects/$(gcloud projects describe <project-id> --format='value(projectNumber)')/locations/global/workloadIdentityPools/github-pool/providers/github-provider"

# 8. Output the service account email (paste into GitHub Secret: WIF_SERVICE_ACCOUNT)
echo "WIF_SERVICE_ACCOUNT:"
echo "github-actions-deploy@<project-id>.iam.gserviceaccount.com"
```

If the `firebase deploy` step later fails on a permissions error, the fix is to grant an additional role to the service account here — not to fall back to a static credential.

## GitHub Actions Workflow

New file: `.github/workflows/deploy.yml`

**Trigger:** push to `main`, path-filtered to files that affect the deployed build, plus manual dispatch:
```yaml
on:
  push:
    branches:
      - main
    paths:
      - 'src/**'
      - 'index.html'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'vite.config.ts'
      - 'tsconfig.json'
      - 'firebase.json'
      - '.firebaserc'
      - '.github/workflows/deploy.yml'
  workflow_dispatch:
```

**Steps:**
1. `actions/checkout@v4`
2. `pnpm/action-setup@v4` (pins the pnpm version from `packageManager`)
3. `actions/setup-node@v4`, `node-version: '24'` (matches local dev), with pnpm cache
4. `pnpm install --frozen-lockfile`
5. `pnpm test` (Vitest — `src/core/__tests__/*`)
6. `pnpm run build` (`tsc --noEmit && vite build` → `dist/`)
7. `google-github-actions/auth@v3` with `workload_identity_provider: ${{ secrets.WIF_PROVIDER }}`, `service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}`
8. `npx firebase-tools@<version> deploy --only hosting --project <project-id> --non-interactive` — pin `<version>` to whatever is current at implementation time (`npm view firebase-tools version`), the same way corgi pins `firebase-tools@15.22.1`

**Permissions:** `contents: read`, `id-token: write` (required for the OIDC token exchange in WIF auth).

## GitHub Secrets

| Secret | Value |
|---|---|
| `WIF_PROVIDER` | Output from WIF setup step 7 |
| `WIF_SERVICE_ACCOUNT` | `github-actions-deploy@<project-id>.iam.gserviceaccount.com` |

Set at: **GitHub repo (`hokita/mouse2`) → Settings → Secrets and variables → Actions → New repository secret**

## File Structure Changes

```
mouse2/
  .github/
    workflows/
      deploy.yml
  firebase.json
  .firebaserc
```

## Testing Strategy

- No new application code, so no unit tests to add. The existing `pnpm test` (Vitest) and `pnpm run build` (type-check + Vite build) already run as gate steps inside the deploy workflow itself — a broken build or failing test blocks the deploy.
- **Manual verification**: after the one-time GCP/WIF/Firebase setup is complete and the workflow file is merged to `main`, confirm the Actions run succeeds and the game loads correctly at the deployed Firebase Hosting URL (`https://<project-id>.web.app`).

## Out of Scope

- Cloud Run, Artifact Registry, Firestore, Secret Manager, Auth — none apply; mouse2 has no backend
- PR preview deploy channels
- Lint step / ESLint setup
- Staging environment — production (`main`) only, matching corgi
- Custom domain configuration
