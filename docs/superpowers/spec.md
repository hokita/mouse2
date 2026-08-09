# Corgi — Stack & Architecture Reference

Reference notes on this repo's stack, intended as a starting point for bootstrapping a new GCP + TypeScript project.

## What it is

Personal AI chat app (Gemini-backed). Monorepo layout: `frontend/`, `backend/`, `e2e/`.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS v4, PWA (`vite-plugin-pwa`), Firebase Auth |
| Backend | Node.js 24 + Express + TypeScript, run via `tsx` in dev / compiled with `tsc` for prod |
| AI | Gemini via `@google/generative-ai` (chat + title generation models configured centrally) |
| Data | Firestore (conversation history), governed by `firestore.rules` + `firestore.indexes.json` |
| Auth | Firebase Auth, gated by an email allowlist (`ALLOWED_EMAILS` env var) |
| Observability | Langfuse (via `@langfuse/otel` + OpenTelemetry) for LLM tracing |
| Testing | Vitest (unit, both packages) + Playwright (e2e, with Firebase emulators) |
| Lint/format | ESLint (flat config, `typescript-eslint`) + Prettier |

## GCP / Firebase infrastructure

- **Frontend hosting:** Firebase Hosting, deployed via `firebase deploy` (SPA rewrite to `index.html`)
- **Backend hosting:** Cloud Run, region `asia-northeast1`, containerized via a two-stage Alpine Docker build (build → slim runtime, port 8080)
- **Registry:** Artifact Registry (`asia-northeast1-docker.pkg.dev/.../backend`)
- **Secrets:** GCP Secret Manager, wired into Cloud Run via `--set-secrets` (API keys, allowlist, Langfuse creds)
- **CI/CD:** GitHub Actions (`.github/workflows/backend.yml`) — lint → test → build → Workload Identity Federation auth to GCP → Docker build/push → `gcloud run deploy`, triggered on push to `main` when `backend/**` changes
- **Local dev parity:** Firebase emulators for Auth + Firestore, used both locally and in e2e CI

## Notable patterns worth reusing

- **Workload Identity Federation over service-account keys** for GitHub Actions → GCP auth — no static credentials stored in CI.
- Two-stage Docker build keeps the Cloud Run image slim (deps installed twice: once for build, once `--omit=dev` for runtime).
- Cloud Run deploy pins `min-instances 0` (scale-to-zero) / `max-instances 2` — cheap personal-scale config.
- Path-filtered GitHub Action (`paths: backend/**`) means frontend and backend deploy independently.
- Environment/secrets split cleanly: plain env vars via `--set-env-vars`, sensitive values via `--set-secrets` referencing Secret Manager.

## Key files to look at

| File | Purpose |
|---|---|
| `README.md` | Stack summary, local dev, env vars |
| `backend/Dockerfile` | Two-stage build for Cloud Run |
| `.github/workflows/backend.yml` | CI/CD pipeline (WIF auth → Cloud Run deploy) |
| `firebase.json` | Hosting, Firestore, emulator config |
| `firestore.rules` / `firestore.indexes.json` | Firestore security rules and indexes |
| `backend/package.json` / `frontend/package.json` | Dependency and script reference |
