# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Build and run (Bun is the build tool; Node ≥18 is the runtime target):

```bash
bun install                                # install deps
bun run dev                                # run CLI from src/index.ts (no build)
bun run start                              # alias of dev
bun run build                              # bundle to dist/index.js (ESM, node target)
node dist/index.js <command>               # run built CLI
```

`npm install -g .` or `npm link` after build to expose the `startidy` bin globally.

There is no test runner, linter, or formatter configured. `npm run prepublishOnly` runs `npm run build` (note: package.json mixes `bun build` and `npm` script names — building requires Bun installed).

## Runtime configuration

The CLI reads credentials from three sources, with this precedence: CLI flags → environment variables → `.env` in CWD (loaded via `dotenv` at `src/index.ts`). Required vars: `GITHUB_TOKEN`, `GITHUB_USERNAME`, `GEMINI_API_KEY`. Tunables (see `src/utils/config.ts` and README): `MAX_CATEGORIES` (cap 32 — GitHub's hard limit), `CLASSIFY_BATCH_SIZE`, `BATCH_DELAY`, `GEMINI_MODEL`, `GEMINI_RPM`, `LIST_IS_PRIVATE`, `DEBUG`.

CLI flags are pushed back into `process.env` in a Commander `preAction` hook before subcommands run, so downstream code reads everything via `loadConfig()`.

## Architecture

The CLI organizes a user's GitHub Stars into GitHub Lists using Gemini for both category planning and per-repo classification. The pipeline is intentionally split into four idempotent steps that can be run individually or chained via `run`:

1. **plan** (`src/commands/plan.ts` + `services/gemini.ts` + `prompts/category-planner.ts`) — fetches all starred repos, asks Gemini to design up to 32 categories using `Major: Minor` names (≤20 chars, GitHub List name limit), and persists the result via `utils/plan-storage.ts` to `.stardust-plan.json`.
2. **create-lists** (`src/commands/create-lists.ts`) — reads the saved plan and creates the corresponding GitHub Lists via `api/lists.ts`. `--force` allows partial creation when some Lists already exist.
3. **classify** (`src/commands/classify.ts` → `services/classifier.ts`) — batches repos (default 20), fetches each README (`api/readme.ts`), runs `GeminiService.classifyRepositoriesBatch` with the planned categories, then attaches each repo to its target Lists via GitHub's GraphQL `addRepoToGitHubLists`. `--use-existing` lets classify operate against the live Lists without a plan file; `--only-new` skips already-classified repos; `--reset` detaches everything.
4. **run** (`src/commands/run.ts`) — orchestrates plan → delete-existing-Lists (interactive prompt) → create-lists → classify in one shot; `--only-new` and `--dry-run` are honored.

Cross-cutting modules:

- `src/api/` — thin GitHub client. `client.ts` is a shared fetch wrapper with auth/retry; `lists.ts` and the `addRepoToGitHubLists`/`getRepositoryNodeId` helpers use GitHub's GraphQL API (Lists are not exposed in REST). `repos.ts` paginates starred repos; `readme.ts` fetches raw README content.
- `src/services/gemini.ts` — wraps `@google/genai`, handles JSON-mode prompting and parsing for both planner and classifier prompts in `src/prompts/`.
- `src/utils/rate-limiter.ts` — provides `delay`, `retryWithBackoff` (used around every GitHub mutation in `classifier.ts`), and `runWithConcurrency` (5-way parallel List attach within a batch).
- `src/utils/update-checker.ts` — non-blocking npm version check fired from `index.ts`.

Type contracts live in `src/types.ts` (domain: `Category`, `CreatedList`) and `src/api/types.ts` (GitHub API shapes).

## Constraints worth remembering before changing behavior

- GitHub Lists cap: **32 Lists** per user, **20 chars** per List name. The planner prompt and `MAX_CATEGORIES` enforcement both depend on this.
- Gemini Free tier defaults to 15 RPM; the batch loop uses `BATCH_DELAY` between batches and `runWithConcurrency(..., 5)` inside batches — changing either can trigger 429s.
- All List CRUD goes through GraphQL; there is no REST fallback. `getRepositoryNodeId` is required because the GraphQL mutation needs the global node ID, not `owner/repo`.
- `tsconfig.json` includes `github-lists-api.ts` at the repo root which does not currently exist — leftover include; safe to ignore but don't rely on it.
