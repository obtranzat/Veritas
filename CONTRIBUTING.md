# Contributing to Veritas

Thank you for helping make open-source content intelligence, cryptographic authorship provenance, and privacy-first AI forensics accessible to everyone!

---

## 1. Local Development Setup

### Prerequisites
- **Node.js** `>= 22.0.0` (`node -v`)
- **npm** `>= 10`
- **Git**

### Steps
```bash
git clone https://github.com/<your-username>/veritas.git
cd veritas
npm install --legacy-peer-deps
cp .env.example .env
npm run dev
```
The UI and REST API run together on `http://localhost:3000`. All changes to backend logic are tested immediately via Vitest without needing external API keys.

---

## 2. Branching Strategy & Commit Conventions

- `main`: Always releasable, protected by `CI Security & Coverage Gate` and visual regression checks.
- Topic branches created from `main`:
  - `feat/<short-description>` — New features or detection signals
  - `fix/<short-description>` — Bug fixes
  - `security/<short-description>` — Hardening or vulnerability fixes
  - `docs/<short-description>` — Documentation or examples
  - `chore/<short-description>` — Build, dependency, or CI improvements

Use **[Conventional Commits](https://www.conventionalcommits.org/)**:
- `feat(router): add custom model header support for Tier 11 provider`
- `fix(ui): guard controlled numeric draft state in ResilienceRouterWorkspace`
- `docs(k8s): add HPA tuning notes for batch upload nodes`
- `security(api): tighten SSRF DNS rebinding guard`

---

## 3. Coding Standards

- **TypeScript Strictness**: All source files must pass `npm run lint` (`tsc --noEmit`). Avoid `any`; export shared types from `src/types/veritas.ts`.
- **Frontend Modules**:
  - React 19 functional components + hooks under `src/components/`.
  - Style exclusively with Tailwind CSS v4 utility classes (`@import "tailwindcss";` in `src/index.css`). Keep both light and dark modes high-contrast (`>= 4.5:1`).
  - Maintain strict accessibility (`aria-label`, semantic buttons/tabs, keyboard navigation) and controlled form element invariants.
  - Keep secondary tabs lazy-loaded via `React.lazy` in `src/App.tsx`.
- **Backend Modules**:
  - Business logic belongs in `src/server/` (`pipeline.ts`, `aiRouter.ts`, `security.ts`, `store.ts`, etc.).
  - Never commit secrets or call external paid providers without passing PII through `redactPiiForExternalAirlock()` when hybrid-airlock is active, and always honor `local-only` privacy mode.
  - Update `src/server/openapi.ts` and `docs/api-reference.md` whenever adding or changing HTTP endpoints.

---

## 4. Testing Requirements (Minimum 95% Coverage)

Every PR touching code must maintain Vitest V8 thresholds defined in `vitest.config.ts`:
- **Statements**: `>= 95%`
- **Lines**: `>= 95%`
- **Functions**: `>= 95%`
- **Branches**: `>= 80%`

Run before pushing:
```bash
npm run validate:release
```
This executes:
1. `npm run lint` (`tsc --noEmit`)
2. `npm run test:coverage` (unit, API, security red-team, AI validation suites)
3. `npm run build` (Vite production bundle)

---

## 5. Pull Request & Review Process

1. Rebase onto latest `main` and verify `npm run validate:release` passes locally.
2. Fill out `.github/PULL_REQUEST_TEMPLATE.md` completely (attach screenshots for UI changes across mobile `360px` and desktop `1440px` in light and dark mode).
3. Ensure CI checks pass cleanly:
   - `Typecheck, Audit, Unit/API/Security Tests & >=95% Coverage`
   - `Real Browser Visual Regression`
4. Maintainer Review:
   - Non-trivial architectural or security PRs require at least 1 maintainer sign-off.
   - Documentation and typo PRs are fast-tracked within 48 hours.
5. Pull requests are squash-merged to preserve linear history for automated semantic release notes.
