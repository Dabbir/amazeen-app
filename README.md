# AMAZEEN

**The weekly magazine of your own life.**

Write a little every day (a story, a quick note, something someone said, a list) and every Sunday at midnight AMAZEEN takes the week to press as a real, laid-out magazine issue: a riso-printed cover, contents page, feature spreads with drop caps and pull quotes, a "Dispatches" section, an "Overheard" page, a *By the numbers* data spread with a mood "weather report", and a back page. Issues collect on a searchable, printable shelf.

No account, no server. Everything lives in your browser and can be exported/imported as JSON.

## Data model (local-first)

- **IndexedDB** holds the archive. Every save is also mirrored synchronously to `localStorage` with a timestamp, so a write cut off by closing the page is never lost. On load, the newer copy wins.
- **Drafts** live in `localStorage` and are flushed when the tab is hidden.
- **Several tabs** stay in sync through `BroadcastChannel`.
- The app asks the browser for **persistent storage**, and installing it as a PWA makes eviction far less likely.
- **Backups:** Settings → Export downloads a JSON archive. The Desk reminds you when there are un-exported changes older than 14 days. Import previews the file, then merges (newest edit wins) or replaces.
- **Schema changes** go through `migrate()` in `src/domain/storage.ts`, so old exports always open.

## Deploying (Cloudflare Pages)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → choose this repo.
2. Build settings: framework **None**, build command `npm run build`, output directory `dist`, environment variable `NODE_VERSION=24`.
3. Production branch: `main`. Every pull request gets its own preview URL.
4. `public/_headers` sets the CSP, HSTS and caching. Cloudflare Pages serves `index.html` for unknown paths automatically (SPA mode), so deep links like `/issue/2026-W46?p=3` work.
5. Optional: GitHub → Settings → Branches → protect `main` and require the **CI** checks.

### Release checklist

1. CI green on the pull request (lint, types, unit, build, e2e + accessibility).
2. Open the preview URL and spot-check the Desk, Composer, Reader and Shelf on a phone.
3. Bump `version` in `package.json`, add a `CHANGELOG.md` entry, and merge to `main`.
4. Verify production. Open tabs get an "A new edition of AMAZEEN is ready" prompt.
5. To roll back, use Cloudflare Pages → Deployments → *Rollback* on the previous deploy.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run lint       # oxlint (zero warnings allowed)
npm test           # unit + integration tests (Vitest + Testing Library)
npm run test:e2e   # Playwright against the production build, with axe accessibility audits
npm run build      # typecheck + production build (PWA) to dist/
```

## The product

| Screen | What it does |
| --- | --- |
| **Onboarding** | Name your magazine and watch the masthead appear live on a sample cover. Start blank or with a six-week sample archive. |
| **Desk** | This week's issue in production: live cover proof, a *press check* (cover story, 5 pieces, a quote, 3 days on the beat), deadline countdown, filed pieces grouped by day with star / edit / delete-with-undo, streak and archive stats. |
| **Composer** | Distraction-free writing for four kinds of piece. Section, mood ("weather") and cover-worthy toggle. Per-kind autosaved drafts that survive reloads, inline validation that focuses the first problem, unsaved-edit guards, `⌘↵` to file, and a rubber-stamp *FILED* moment. |
| **Reader** | The issue, page by page. Arrow keys, swipe, page rail, deep-linkable `?p=` pages, page-turn motion, "art-direct the cover" (ink + cover line), and a print stylesheet that prints every page. |
| **Shelf** | Every issue by month as covers; full-text search across all issues with highlighted matches that deep-link to the exact page; section filters. |
| **Settings** | Masthead, export/import (validated, size-capped, damaged entries skipped), sample data, type-to-confirm erase, and rescue export if stored data is ever unreadable. |

Keyboard: `W` story · `N` note · `/` search · `←/→` turn pages · `Esc` close.

## Architecture

```
src/
  domain/      Pure, framework-free business logic (fully unit-tested)
    types.ts     Discriminated-union Entry model, Issue, AppData
    entries.ts   Normalisation, validation, strict parsing of untrusted data
    issues.ts    ISO-week grouping, numbering, cover-story selection, cover lines, stats, press check, streaks
    layout.ts    Turns an issue into pages + table of contents
    search.ts    Multi-term search with snippets
    storage.ts   Versioned persistence; never throws, reports corrupt/quota/unavailable
    dates.ts     ISO weeks, ranges, countdowns
    text.ts      Word counts, pull-quote picking, smart quotes, safe highlighting
  state/       Reducer + context store (derived issues memoised per week), hooks
  router/      ~150-line typed History router with View Transitions
  components/  CoverArt (CSS-only, container-query scaled), Dialog (native <dialog>), Toasts, shell
  features/    onboarding · desk · composer · reader · shelf · settings (secondary screens code-split)
```

Design decisions:

- **Only React at runtime.** Routing, state, dialogs, toasts and charts are small, purpose-built modules. Fonts are self-hosted.
- **Covers are pure CSS.** All measurements use `cqi` container units, so one component renders crisply from a 110px thumbnail to a full page, and prints.
- **Strict TypeScript** (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Untrusted input is parsed, not trusted.** Imports and storage go through the same validators as the composer; React escapes all text, and search highlighting never builds HTML.
- **Accessible by default:** semantic landmarks, skip link, labelled controls, native radios for pickers, live regions for page turns and toasts, visible focus, `prefers-reduced-motion` and `prefers-color-scheme` support.

Typography: Fraunces (display), Newsreader (text), Instrument Sans (labels), self-hosted via Fontsource.

See [`docs/audit.md`](docs/audit.md) for the production-readiness audit and [`CHANGELOG.md`](CHANGELOG.md) for releases.
