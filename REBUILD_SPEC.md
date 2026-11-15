# MyBookshelf — Rebuild Specification & Implementation Architecture

**Status:** Approved direction documented; not yet implemented.
**Reference:** User-supplied six-panel design showing Enchanted Library, Dark Academia, Cozy Cottage, Celestial Library, Oceanic Library, and Forest Haven.
**Product:** A free-to-use, installable Android-first personal book catalog for anyone with the shared link. Each person has a separate collection and can optionally sync that collection to their own Google Drive. No paid hosting, paid app builder, mandatory subscriptions, or hardcoded book records.
**Existing production repository:** `Octavius117/personal-library`. **Existing production data must be preserved.**

## 1. Product vision and visual acceptance

The six-panel reference is the visual acceptance baseline, not a suggestion to swap CSS color variables. The app must look like six illustrated, *different worlds* while the interaction patterns remain consistent.

Shared layout at approximately 390 × 844 CSS pixels:
- Header overlaid onto each themed setting: elegant “My Library”/“MyBookshelf” title, search icon, notifications/settings access.
- Under header: horizontal filters **All Books | Reading | Finished | Want to Read**. Active tab distinctly indicated.
- Main focus: a bookshelf containing large, recognizable real book covers. Aim for **three covers per row**, two rows visible when populated; book spines or shelves should frame covers rather than obscure them. Cover images retain correct aspect ratios.
- Distinctive illustrated atmosphere around and behind the shelves. Decorative elements must not interfere with book cover legibility, text, tap targets, camera permission dialogs, or scrolling.
- Fixed bottom navigation with **Home | My Books | Scan | Challenges | Profile**. Every item opens a working screen, not a dead icon. Scan is visually prominent.
- Compact, attractive book-detail overlay with cover, title, author, series/edition, ISBN, reading status, rating, notes, edit/delete and save.
- Light and dark readable dialog surfaces appropriate to each theme, including high-contrast forms.

### Theme-specific visual requirements

| Theme | Approved scene elements | Mood / treatment |
|---|---|---|
| **Enchanted Library** | Violet arched library, moonlit tower/window, lavender blossoms, glowing orb, owl, candles, magical sparkles, luminous violet bookshelf accents | Fantasy/magical, rich purple but not a flat black screen |
| **Dark Academia** | Dark timber bookshelves, old leather books, brass desk lamp, stained-glass Gothic window, warm candlelight, marble bust | Scholarly and cozy; warm sepia/amber |
| **Cozy Cottage** | Daylight through a leafy window, flowers, warm cream-painted shelving, teacup, soft cushions and sleeping orange cat | Bright, airy, welcoming |
| **Celestial Library** | Deep blue star field, constellations, galaxy, crescent moon, antique astronomical sphere/armillary, candles | Cosmic and luminous |
| **Oceanic Library** | Teal/turquoise ocean-window scene, shells, coral, starfish, aqua glass lanterns, driftwood and waves | Breezy coastal blue-green |
| **Forest Haven** | Mossy tree arch, greenery, tiny lanterns, fireflies, mushrooms, storybook deer, lush wooden bookcase | Woodland fantasy, enchanted green |

Each theme requires its own original visual assets: background/scene, shelving treatment, ornaments and UI accents. Do not crop or display the six-panel reference screenshot as the app UI. It is reference art, not an implementable interface. Do not add mockup books to a real user's library.

### Visual acceptance

- At 360, 390 and 430 CSS-pixel widths, the app must read as the reference: illustrated environment, cover-first shelves, five navigation actions, readable filters.
- Switching themes changes the **complete visual world** (scene, shelves, ornaments, colors, gradients, typography treatment) without changing or hiding collection data.
- A brighter look is available by default or through a persistent first-run choice. Recommended: **Cozy Cottage** as default for a light inviting experience; **Enchanted Library** stays available as the dramatic fantasy option.
- Preserve the six theme names exactly.
- Respect reduced-motion preferences; decorate without causing long load times. Provide compressed WebP/AVIF artwork and fallback colors while images load.
- Decorative visual assets must be original or appropriately licensed; book covers come from legitimately accessible catalog/cover URLs and are not embedded from the mockup.

## 2. User stories and screens

### Home
Illustrated theme environment, “Continue Reading” section (only if relevant), recent additions, collection count, reading progress, a prominent scan action, and a true empty state for new users. No fake seeded collections.

### My Books
Shelves + filters (All Books, Reading, Finished, Want to Read), search by title/author/ISBN/series, sort by title/author/recently added, optional list/grid view, and book detail/edit screen. Do not treat an unrecognized book as a success.

### Scan
Full-screen camera with camera permission explanation, target reticle aligned for retail ISBN barcodes, flashlight control if supported, manual ISBN entry, cancel. On detection: stop camera, normalize ISBN, verify checksum, look up metadata, show a confirmation form, and save only after explicit **Add to Library** tap. Detect existing ISBN and offer view/edit instead of silently duplicating.

### Challenges
Functional initial scope: reading goal (books per year) with progress, books finished this year, and simple noncompetitive milestones. Nothing that requires an account or paid backend. If the implementation isn't ready, hide the tab rather than leave it inert.

### Profile / Settings
Display name stored locally, theme picker with six visual previews, install instructions, export/import, Google Drive connect/disconnect, sync status, data ownership/privacy explanation, and app version. Settings → Appearance changes theme at any time.

### Book form
ISBN (readable/editable), title (required), authors, cover preview/url or custom cover, series, publisher, publication year, status, optional rating, notes, dates started/finished. Support a manual book that has no ISBN or is absent from the catalogs. Never auto-add on scan alone.

## 3. Required ISBN/metadata pipeline

**No hardcoded exceptions for individual ISBNs, no fake successes, no swallowing HTTP or CORS errors into “not found.”** Camera decoding and catalog lookup are two different subsystems and must report their state separately.

1. Request camera over HTTPS and prefer the rear camera.
2. Detect **EAN-13 / ISBN-13** and **ISBN-10** where supported; prefer browser `BarcodeDetector` only when its supported formats include EAN-13. Use a maintained ZXing browser decoder as a fallback for devices without native support. Ignore the adjacent five-digit price supplement (e.g. `51999`).
3. Normalize the exact detected ISBN. Verify ISBN-10/ISBN-13 checksum. If invalid, ask for a rescan rather than querying a bogus value.
4. Query bibliographic catalogs through a dedicated `catalogService`. Recommended: Open Library ISBN/edition lookup and Google Books `q=isbn:` search, with a standards-compliant search fallback. Validate any returned edition identifiers against the requested ISBN before accepting an incorrect edition as an exact match.
5. Use an explicit response union: `found` with book data and source; `not_found` after reachable catalogs report no matching edition; `network_error`; `rate_limited`; `invalid_isbn`; `permission_denied` (scanner). Log useful technical details for diagnostics but present short human-readable errors.
6. Never show “No match found” when a request actually failed with HTTP 404, HTTP 403, blocked CORS, timeout, or offline state. A single provider's 404 does not establish that no catalog has the book.
7. Return title, authors, correct edition/ISBN, cover if available, source provider and optional publisher/description/year. Any missing optional field remains blank and editable.
8. Use bounded timeouts and distinguish aborted/canceled requests. Support a retry action and manual entry without erasing the scanned ISBN.
9. Cache successful lookup metadata safely by ISBN, with reasonable freshness. Do not cache transient errors permanently.

Official API formats to investigate and exercise on real Android browsers:
- Open Library: `https://openlibrary.org/isbn/{isbn}.json`, and Search API `https://openlibrary.org/search.json?isbn={isbn}`
- Google Books: `https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}`; confirm credentials/quota and browser behavior for production, rather than assume all anonymous requests will succeed.

**Required user-reported regression case:** EAN-13 **9780593625484**, publisher-listed book **When the Bones Sing** by **Ginny Myers Sain**. The original screenshot showed accurate ISBN capture but the outdated alert “No match found. Enter the book manually.” Diagnose the actual catalog/API response and cached-app version; do not inject a hand-written record to make this case pass.

Other fixtures should include: ISBN-10 conversion, invalid checksum, books without covers, two books with the same title but distinct ISBNs, nonexistent ISBN, offline lookup, a rate-limited catalog, a 404 from one provider, a malformed API response, and a 5-digit price supplement.

## 4. Storage, sharing, Google Drive and migration

### Local-first data
- Use IndexedDB (via Dexie or equivalent), not a large `localStorage` JSON blob, for collections and mutation queues.
- New records receive UUIDs and timestamps. Persist a device identifier. Schema:
  ```ts
  type ReadingStatus = 'not-started' | 'want-to-read' | 'reading' | 'finished';
  interface Book {
    id: string; isbn10?: string; isbn13?: string;
    title: string; authors: string[];
    coverUrl?: string; coverSource?: string;
    series?: string; publisher?: string; year?: number;
    description?: string; rating?: number; notes?: string;
    status: ReadingStatus; startedAt?: string; finishedAt?: string;
    metadataSource?: 'openlibrary' | 'googlebooks' | 'manual';
    createdAt: string; updatedAt: string; deletedAt?: string;
  }
  ```
- Per-user isolation is **per browser/device** until the person explicitly connects their own Google account. A public GitHub website does **not** imply shared public libraries, but a second person using the same browser profile could see that local data.
- Preserve existing installations' data by importing the current `localStorage['personal-library-books']` once into IndexedDB. Export it before migration, deduplicate by stable record ID, and do not erase the original until verified. Detect migration errors and offer recovery.

### Backups
- Manual JSON export/import works **without sign-in**, even if Google Drive is never used.
- Optional Google Drive app-data backup belongs to the signed-in user's own Google account, in the private `appDataFolder`; no data is committed to the public GitHub repository.
- Google Drive OAuth/consent must be explicitly completed by each user. This requires a configured Google Cloud project, Drive API, browser origin, OAuth client ID and relevant scopes; there may be app verification or account restrictions. Never claim automatic backups work until this has been configured and passed live tests.
- After every add/edit/delete/status update, **save locally immediately** and enqueue a backup. Upload promptly when authorized and online; if offline/unauthorized, retain pending operations and display **Saved on this device · Cloud backup pending**. Display **Backed up to Drive at [time]** only after confirmed API success. No claim of background sync while the browser is closed.
- Store deletion tombstones for multi-device reconciliation, rather than accidentally resurrect removed books. Define version/merge strategy and conflict review. A user signing into a fresh phone must be able to restore from their own Drive without importing other people's data.
- Do not store private client secrets or refresh tokens in the public frontend. Browser OAuth public client ID is not a secret; treat access tokens appropriately. Provide Disconnect and Revoke guidance, as well as visible data export/delete controls.

## 5. PWA and deployment

- Free GitHub Pages hosting over HTTPS. Single public app URL; every visitor gets an independent collection until they connect their own Drive account.
- `manifest.webmanifest`: name “MyBookshelf”, short name, description, correct `start_url`, `scope`, `display: standalone`, branded **192px** and **512px** icons and a maskable variant. Test Add to Home screen on Android Chrome.
- Service worker: precache versioned static assets; network-first navigation so new `index.html` is not stranded behind an old cache; app-shell fallback when offline. Exclude metadata API requests from indefinite caching. Show **Update available → Reload** if a new release is installed.
- Show version/build hash in settings and diagnostics. Avoid using `?v=3`, `?v=4` as the primary release mechanism.
- Use a staging branch/site or preview route, run tests, and deploy production only on accepted checkpoints. Keep a rollback path.

## 6. Technical structure (recommended)

**Frontend:** Vite + React + TypeScript; typed modules, CSS variables + theme classes, accessible semantic controls. Assets are generated in advance and committed, not synthesized at runtime. No paid app builder.

```text
mybookshelf/
├── public/
│   ├── manifest.webmanifest
│   ├── icons/{icon-192.png,icon-512.png,maskable-512.png}
│   └── themes/
│       ├── enchanted/{scene.webp,shelf.webp,decor.webp}
│       ├── academia/{scene.webp,shelf.webp,decor.webp}
│       ├── cottage/{scene.webp,shelf.webp,decor.webp}
│       ├── celestial/{scene.webp,shelf.webp,decor.webp}
│       ├── ocean/{scene.webp,shelf.webp,decor.webp}
│       └── forest/{scene.webp,shelf.webp,decor.webp}
├── src/
│   ├── app/{App.tsx,router.tsx}
│   ├── screens/{Home,MyBooks,Scan,Challenges,Profile,BookDetail}
│   ├── components/{BookCover,Bookshelf,BookCard,BottomNav,
│   │               ReadingFilters,ThemePicker,BookEditor,SyncStatus}
│   ├── features/
│   │   ├── scanner/{cameraAdapter,isbnValidator,scanController}
│   │   ├── catalog/{openLibrary,googleBooks,catalogService,normalizer}
│   │   ├── library/{bookRepository,model,search,migration}
│   │   ├── backup/{exportImport,driveAuth,driveSync,syncQueue,merge}
│   │   └── themes/{themeRegistry,themeStyles}
│   ├── db/{schema,migrations}
│   └── styles/{base.css,shelves.css,dialogs.css}
├── tests/
│   ├── unit/{isbnValidator,catalogNormalizer,bookRepository,merge}
│   ├── integration/{lookupErrors,migration,backupQueue}
│   └── e2e/{scanAndSave,themeSwitch,install,restore}
├── .github/workflows/{test.yml,deploy.yml}
└── REBUILD_SPEC.md
```

**Contracts between modules**
- `scanner.detect(): Promise<{rawValue, format}>` never performs API calls or saves a book.
- `isbnValidator.normalize(rawValue): ValidISBN | InvalidISBN` handles ISBN 10/13 and checksums.
- `catalogService.lookup(isbn): Promise<CatalogResult>` resolves data or a typed error.
- `bookRepository.add/edit/delete` persists atomically and enqueues sync.
- `driveSync.flushQueue()` runs only with valid consent/connectivity and reports confirmed outcomes.
- `themeRegistry` binds a theme identifier to independent assets, CSS classes and preview art.
- Keep API adapters independently testable; no direct fetch calls scattered through UI components.

## 7. Build order and release gates

| Stage | Deliverable | Gate |
|---|---|---|
| **0: Protect** | Snapshot current repo; preserve/migrate existing local data; establish staging build | No loss of existing books |
| **1: Engine** | Stable barcode decoder, ISBN validation, catalog adapters, typed errors, unit/integration tests | Known valid ISBN decoded and actual metadata tested on Android Chrome; honest offline/404 handling |
| **2: Interface** | Six original illustrated environments; book shelves; header, filters, five navigation destinations; modal editor | Visual review at 360/390/430px against reference; light/dark readability; every visible control works |
| **3: Persistence** | IndexedDB, migration, import/export, search/status, installable PWA, cache updates | Books persist across refresh and browser restart; install opens correct route |
| **4: Optional sync** | Google Drive OAuth and queued change backups | Explicit connection; confirmed restore on second device; offline retry; deletion test; truthful sync status |
| **5: Release** | Automated tests and real-device acceptance; rollback/tag production | All gates green before publishing or claiming “ready” |

## 8. Acceptance test checklist — release blockers

- [ ] Scan ISBN `9780593625484` on the actual Android phone; scanner captures only the 13 digits, not the 5-digit price code.
- [ ] Actual catalog lookup for this ISBN is diagnosed and produces verified data if a provider has it; if none does, the UI accurately says so. No hardcoded ISBN fixture in production.
- [ ] Scan five additional independently prevalidated ISBNs, including a different publisher and an ISBN-10 format.
- [ ] If the catalog returns 404, 429, timeout or CORS/network failure, the message distinguishes provider error from legitimate no match.
- [ ] Scan once → review details → tap Add → the real cover appears on the shelf, correctly proportioned.
- [ ] Title and author searches, status tabs, edit, delete, and duplicate checks work.
- [ ] Switching each of six themes changes the entire illustrated environment; content remains unchanged.
- [ ] On a new collection there are no preloaded fake titles.
- [ ] User's old books survive version upgrade/migration and a normal app reinstall when local site data persists; export exists for deletion/corruption scenarios.
- [ ] Close app, reopen, and verify all entries persisted.
- [ ] Manual export/import can restore a library to a different phone without Google.
- [ ] Google Drive cloud backup/restore across devices is tested **before** that feature is represented as available.
- [ ] Offline changes are preserved locally and cloud status shows pending, never false success.
- [ ] Installed app shows MyBookshelf name, intended icon and usable navigation; update notice delivers new UI rather than an indefinitely cached version.
- [ ] Confirm public GitHub repo reveals no personal book collection, OAuth private secret, or user data.

## 9. What is *not* ready

The existing GitHub Pages production app is a prototype. This document does **not** implement a rebuilt frontend, create six illustrated assets, repair an Android scanning runtime, configure Google OAuth, or prove a successful lookup. Those require actual build, deploy and device acceptance. Do not mark them complete merely because GitHub Actions reports a green deployment.

## 10. Primary sources for implementation details

- The user-provided six-panel theme reference (visual acceptance source).
- Open Library public API: https://openlibrary.org/dev/docs/api/books
- Google Books volumes search: https://developers.google.com/books/docs/v1/reference/volumes/list
- BarcodeDetector browser support: https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector
