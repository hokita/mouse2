# GCP/Firebase Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy mouse2's static Vite build to Firebase Hosting on a new GCP project, with GitHub Actions redeploying automatically on push to `main` via Workload Identity Federation.

**Architecture:** A new GCP project hosts a Firebase Hosting site serving `dist/` (mouse2's Vite build output). GitHub Actions builds and deploys on every push to `main` that touches build-relevant paths, authenticating to GCP via WIF (no static credentials in GitHub Secrets).

**Tech Stack:** GCP (Firebase Hosting, IAM, Workload Identity Federation), GitHub Actions, pnpm, Vite, Vitest.

## Global Constraints

- GCP project ID: `mouse2`, falling back to `mouse2-<suffix>` if taken — decided in Task 1, then reused literally everywhere else (see Task 1's "Produces").
- GitHub repo: `hokita/mouse2`.
- WIF pool: `github-pool`; provider: `github-provider` (names match corgi's convention).
- Service account: `github-actions-deploy@<project-id>.iam.gserviceaccount.com`, granted only `roles/firebasehosting.admin` — no Cloud Run/Artifact Registry/Secret Manager roles, mouse2 has no backend.
- Package manager: pnpm (`pnpm/action-setup`, not `npm ci`) — mouse2 uses `packageManager: pnpm@11.18.0`.
- Node version: 24 in CI, matching local dev.
- No lint step in CI — mouse2 has no `lint` script or ESLint config.
- Deploy trigger: push to `main` (path-filtered) + `workflow_dispatch` only. No PR preview channels.
- `firebase.json` has no SPA rewrite rule — mouse2 is a single-page canvas app, no client routing.
- No GCP billing account required — Firebase Hosting's free Spark plan covers this.
- Spec: `docs/superpowers/specs/2026-08-09-gcp-firebase-deploy-design.md`.

---

### Task 1: Create the GCP project and link Firebase

**Files:** none (infrastructure only, via `gcloud`/`firebase` CLI — both already authenticated locally as `hideee.0202@gmail.com`)

**Interfaces:**
- Produces: `PROJECT_ID` (the literal GCP/Firebase project ID) — every later task uses this literal value, no environment variable carries it across tasks since GitHub Actions and JSON config files can't read a local shell variable.

- [ ] **Step 1: Attempt to create the GCP project with the preferred ID**

Run:
```bash
gcloud projects create mouse2 --name="mouse2"
```
Expected: `Create in progress...` followed by success, OR an error `project ID ... is already in use` (GCP project IDs are global).

- [ ] **Step 2: If Step 1 failed on a name collision, pick a fallback ID**

Run (only if Step 1 failed):
```bash
gcloud projects create mouse2-game --name="mouse2"
```
Expected: success. If this also collides, append a short random suffix (e.g. `mouse2-<4 random alnum chars>`) and retry.

Record whichever project ID succeeded — call it `PROJECT_ID` for the rest of this plan. Every `<project-id>` below is this literal value.

- [ ] **Step 3: Verify the project exists and note its project number**

Run:
```bash
gcloud projects describe <project-id> --format="value(projectId,projectNumber)"
```
Expected: two lines, the project ID and a numeric project number. Keep the project number handy — Task 3 needs it.

- [ ] **Step 4: Enable the Firebase Hosting API**

Run:
```bash
gcloud services enable firebasehosting.googleapis.com --project=<project-id>
```
Expected: command completes with no output (success) or `Operation finished successfully`.

- [ ] **Step 5: Link Firebase to the GCP project**

Run:
```bash
firebase projects:addfirebase <project-id>
```
Expected: output confirming the Firebase project was created, referencing `<project-id>`.

- [ ] **Step 6: Verify via Firebase CLI**

Run:
```bash
firebase projects:list
```
Expected: `<project-id>` appears in the list.

---

### Task 2: Add Firebase Hosting config and do a manual first deploy

**Files:**
- Create: `firebase.json`
- Create: `.firebaserc`

**Interfaces:**
- Consumes: `<project-id>` from Task 1.
- Produces: a live Firebase Hosting site at `https://<project-id>.web.app`, which Task 5's CI workflow will redeploy to on every push to `main`.

- [ ] **Step 1: Write `firebase.json`**

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
  }
}
```

- [ ] **Step 2: Write `.firebaserc`**

```json
{
  "projects": {
    "default": "<project-id>"
  }
}
```
Replace `<project-id>` with the literal ID from Task 1 (e.g. `mouse2`).

- [ ] **Step 3: Build the app**

Run:
```bash
pnpm run build
```
Expected: `tsc --noEmit` reports no errors, then Vite writes output to `dist/` (`dist/index.html` plus hashed asset files).

- [ ] **Step 4: Deploy manually to verify the config works end-to-end**

Run:
```bash
firebase deploy --only hosting --project <project-id>
```
Expected: output ending with `Hosting URL: https://<project-id>.web.app`.

- [ ] **Step 5: Verify the deployed site**

Open `https://<project-id>.web.app` in a browser (or `curl -sI https://<project-id>.web.app | head -1`). Expected: `200 OK`, and the game canvas loads and is playable.

- [ ] **Step 6: Commit the Hosting config**

```bash
git add firebase.json .firebaserc
git commit -m "feat: add Firebase Hosting config"
```

---

### Task 3: Set up Workload Identity Federation for GitHub Actions

**Files:** none (infrastructure only, via `gcloud` CLI)

**Interfaces:**
- Consumes: `<project-id>` and project number from Task 1.
- Produces: `WIF_PROVIDER` and `WIF_SERVICE_ACCOUNT` values — Task 4 stores these as GitHub Secrets.

- [ ] **Step 1: Enable the IAM Credentials API**

Run:
```bash
gcloud services enable iamcredentials.googleapis.com --project=<project-id>
```
Expected: success (no output, or `Operation finished successfully`).

- [ ] **Step 2: Create the Workload Identity Pool**

Run:
```bash
gcloud iam workload-identity-pools create "github-pool" \
  --project=<project-id> \
  --location="global" \
  --display-name="GitHub Actions Pool"
```
Expected: `Created workload identity pool [github-pool].`

- [ ] **Step 3: Create the GitHub OIDC Provider inside the pool**

Run:
```bash
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project=<project-id> \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="attribute.repository == 'hokita/mouse2'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```
Expected: `Created workload identity pool provider [github-provider].`

- [ ] **Step 4: Create the deploy service account**

Run:
```bash
gcloud iam service-accounts create "github-actions-deploy" \
  --project=<project-id> \
  --display-name="GitHub Actions Deploy"
```
Expected: `Created service account [github-actions-deploy].`

- [ ] **Step 5: Grant the service account the Firebase Hosting Admin role**

Run:
```bash
gcloud projects add-iam-policy-binding <project-id> \
  --member="serviceAccount:github-actions-deploy@<project-id>.iam.gserviceaccount.com" \
  --role="roles/firebasehosting.admin"
```
Expected: output ending with the updated IAM policy bindings, including the new binding.

- [ ] **Step 6: Allow the WIF pool to impersonate the service account, scoped to `hokita/mouse2`**

Run:
```bash
gcloud iam service-accounts add-iam-policy-binding \
  "github-actions-deploy@<project-id>.iam.gserviceaccount.com" \
  --project=<project-id> \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$(gcloud projects describe <project-id> --format='value(projectNumber)')/locations/global/workloadIdentityPools/github-pool/attribute.repository/hokita/mouse2"
```
Expected: `Updated IAM policy for serviceAccount [github-actions-deploy@<project-id>.iam.gserviceaccount.com].`

- [ ] **Step 7: Capture the WIF provider resource name**

Run:
```bash
echo "projects/$(gcloud projects describe <project-id> --format='value(projectNumber)')/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
```
Expected: a string like `projects/123456789012/locations/global/workloadIdentityPools/github-pool/providers/github-provider`. This is the `WIF_PROVIDER` value for Task 4.

- [ ] **Step 8: Record the service account email**

`WIF_SERVICE_ACCOUNT` = `github-actions-deploy@<project-id>.iam.gserviceaccount.com` (literal string, no command needed).

---

### Task 4: Store WIF credentials as GitHub repository secrets

**Files:** none (uses `gh` CLI, already authenticated with `repo` scope)

**Interfaces:**
- Consumes: `WIF_PROVIDER` and `WIF_SERVICE_ACCOUNT` values from Task 3.
- Produces: `secrets.WIF_PROVIDER` and `secrets.WIF_SERVICE_ACCOUNT`, consumed by the workflow in Task 5.

- [ ] **Step 1: Set the `WIF_PROVIDER` secret**

Run:
```bash
gh secret set WIF_PROVIDER --repo hokita/mouse2 --body "projects/<project-number>/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
```
Use the exact string captured in Task 3 Step 7. Expected: `✓ Set secret WIF_PROVIDER for hokita/mouse2`.

- [ ] **Step 2: Set the `WIF_SERVICE_ACCOUNT` secret**

Run:
```bash
gh secret set WIF_SERVICE_ACCOUNT --repo hokita/mouse2 --body "github-actions-deploy@<project-id>.iam.gserviceaccount.com"
```
Expected: `✓ Set secret WIF_SERVICE_ACCOUNT for hokita/mouse2`.

- [ ] **Step 3: Verify both secrets are set**

Run:
```bash
gh secret list --repo hokita/mouse2
```
Expected: `WIF_PROVIDER` and `WIF_SERVICE_ACCOUNT` both listed (values are never shown, only names and update times).

---

### Task 5: Add the GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `<project-id>` (Task 1), `secrets.WIF_PROVIDER` / `secrets.WIF_SERVICE_ACCOUNT` (Task 4), the manually-verified `firebase.json`/`.firebaserc` (Task 2).
- Produces: automatic redeploy of `https://<project-id>.web.app` on every push to `main` touching build-relevant paths.

- [ ] **Step 1: Check the current `firebase-tools` version to pin**

Run:
```bash
npm view firebase-tools version
```
Expected: a version string like `15.x.x`. Use this value in place of `<firebase-tools-version>` below.

- [ ] **Step 2: Write `.github/workflows/deploy.yml`**

```yaml
name: Deploy

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

jobs:
  deploy:
    runs-on: ubuntu-latest

    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm run build

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v3
        with:
          project_id: <project-id>
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}
          create_credentials_file: true
          export_environment_variables: true

      - name: Deploy to Firebase Hosting
        run: npx firebase-tools@<firebase-tools-version> deploy --only hosting --project <project-id> --non-interactive
```
Replace `<project-id>` with the literal ID from Task 1 and `<firebase-tools-version>` with the value from Step 1.

- [ ] **Step 3: Commit the workflow**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: deploy to Firebase Hosting on push to main"
```

- [ ] **Step 4: Push the branch and open a PR**

```bash
git push -u origin worktree-gcp-firebase-deploy
gh pr create --title "Deploy mouse2 to Firebase Hosting via GitHub Actions" --body "$(cat <<'EOF'
## Summary
- New GCP project + Firebase Hosting site for mouse2
- GitHub Actions deploys on push to main via Workload Identity Federation (no static credentials)

## Test plan
- [x] Manual `firebase deploy` verified the Hosting config works (Task 2)
- [ ] Merge and confirm the Actions run succeeds
- [ ] Confirm https://<project-id>.web.app loads the game after merge
EOF
)"
```
Expected: a PR URL is printed.

- [ ] **Step 5: After merging, verify the CI-driven deploy**

Merge the PR, then run:
```bash
gh run watch --repo hokita/mouse2
```
Expected: the `Deploy` workflow run completes with all steps green. Then confirm `https://<project-id>.web.app` still loads and is playable — this proves the CI path (not just the Task 2 manual deploy) works.

---

## Out of Scope (carried over from the spec)

- Cloud Run, Artifact Registry, Firestore, Secret Manager, Auth
- PR preview deploy channels
- Lint step / ESLint setup
- Staging environment
- Custom domain configuration
