# @kavoxx/playwright-helper

**English** | [Русский](README.ru.md)

Utility library for end-to-end testing with [Playwright](https://playwright.dev/): API mocking, HAR recording/replay, screenshot helpers, XLSX comparison and small test utilities.

## Features

- **API mocking** — record/replay HAR files, stub endpoints with JSON files or inline data, block unmocked API calls, monitor network and console errors.
- **Global HAR** — record a HAR for a whole page load directly from `playwright.config.ts`.
- **XLSX comparison** — compare a downloaded `.xlsx` file with a reference file, creating the reference on first run.
- **Screenshot helpers** — take the same screenshot at several viewport resolutions.
- **Network recorder mode** — authorization hook and screenshot skipping for HAR recording runs.
- **Playwright utilities** — mouse emulation, waits, scrolling, focus helpers, fixed clock, test annotations.

## Installation

```bash
npm install @kavoxx/playwright-helper
```

or

```bash
yarn add @kavoxx/playwright-helper
```

The package requires `@playwright/test` and is tested against `1.54.2`.

## Usage

Import only what you need from the package root:

```ts
import {
  MockServerHelper,
  globalHar,
  compareDownloadedXlsx,
  networkRecorderAuthHook,
} from "@kavoxx/playwright-helper";
```

---

## API mocking — `MockServerHelper`

`MockServerHelper` wires a test's `page` to a HAR file, lets you stub individual endpoints, and asserts which API calls were made.

### Initialize

```ts
import { test } from "@playwright/test";
import { MockServerHelper } from "@kavoxx/playwright-helper";

let mocks: MockServerHelper;

test.beforeEach(async ({ page }, testInfo) => {
  mocks = await MockServerHelper.init(page, testInfo);
});

test.afterEach(async () => {
  await mocks.expectApiCalls();
});
```

`MockServerHelper.init(page, testInfo, opts?)` creates the helper and calls `routeFromHAR()` with the resolved `mockUrl`.

Passing `true`/`false` instead of an options object is shorthand for enabling/disabling the default behaviour:

```ts
const mocks = await MockServerHelper.init(page, testInfo, true);
```

### Options (`MockServerHelperOptions`)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `fixedTime` | `string \| boolean` | `true` | Installs a fixed clock (`2024-02-02T10:00:00` when `true`) |
| `monitorNetworkError` | `boolean` | `true` | Collects failed requests |
| `strictApiCall` | `boolean` | `true` | Aborts API calls that are not mocked |
| `useAuth` | `boolean` | `false` | Reserved auth flag |
| `zipHAR` | `boolean` | `false` | Reads the HAR from a `.zip` file |
| `harName` | `string` | `"har"` | HAR file name inside the snapshots directory |
| `mockUrl` | `string \| RegExp` | `getAppUrl("/**/api/**")` | URL pattern used for HAR routing and unmocked-call detection |

The HAR path is derived from the test file and title:

```
<test file>-snapshots/<test title with dashes>/har/<harName>[.zip]
```

### Stub endpoints — `use`, `forceUse`

```ts
await mocks.use([
  // JSON file next to the test file
  ["GET:/ekp-user-service/api/auth/check", "utils/mocks/auth.mock.json"],

  // Inline JSON response
  ["GET:/ekp-presentations/api/Presentations", [{ id: 1 }, { id: 2 }]],

  // Custom handler
  [
    "POST:/ekp-report-management/api/DataEngine/excel",
    async (route, { resolveMockFile }) => {
      await resolveMockFile(route, "utils/mocks/report.mock.json");
    },
  ],

  // Response body taken from a recorded HAR entry
  [
    "GET:/ekp-presentations/api/Presentations/301",
    "har/[GET:/ekp-presentations/api/Presentations/301 (#2)]",
  ],
]);
```

Each entry is a `UseApi` tuple: `[url, response, opts?]`.

- `url` — `"<METHOD>:<path>"`, e.g. `"GET:/api/users"`.
- `response` — a file path, inline data, or a response function.
- `opts` — `{ times?, vars?, delay? }`.

Response values:

- String path to a `.json` file — relative paths start from the test directory, other paths from the package root. JSON files support variable interpolation (see below). `har/<fileName>` reads a file from the HAR directory.
- `har/[METHOD:URL]` / `har/[METHOD:URL (#N)]` — replays the body of the matching HAR entry. Without `(#N)` the first match is used.
- Inline `object`/`array` — fulfilled as JSON.
- Function `(route, utils) => Promise<void>` — full control; `utils.resolveMockFile(route, path, { vars, delay })` reuses the file logic.

`use` is skipped automatically while a HAR is being recorded (network recorder mode). Use `forceUse` to apply mocks regardless.

### Assertions

```ts
await mocks.expectApiCalls();                 // compare with the recorded HAR
await mocks.expectApiCalls({ "GET:/api/x": "200" }, { "POST:/api/y": "204" });

await mocks.expectNetworkError();             // no failed requests
await mocks.expectConsole();                  // no console errors

mocks.apiCalls;                               // copy of the recorded calls
await mocks.clearApiCalls();                  // reset the recorded calls
```

`expectApiCalls(expected?, auxExpected?)` accepts an optional expected map; otherwise it is built from the HAR plus the optional `auxExpected` map.

### Other methods

- `mocks.strictApiCall()` — abort unmocked API calls (wired automatically by default).
- `mocks.monitorNetworkError()` / `mocks.monitorConsole(types?)` — enable monitoring (wire automatically by default).
- `mocks.useAuth(mock?, force?)` — stub the auth-check endpoints.
- `mocks.setFixedTime(time?)` — install a fixed clock.
- `mocks.cleanUse()` — remove all routes registered on the page (`unrouteAll`).
- `mocks.waitDebug()` — keep the page open for debugging.
- `MockServerHelper.getHarPath(testInfo, opts)` / `MockServerHelper.getHarFilePath(testInfo, opts, fileName)` — resolve HAR paths.

### Variables in mock files

String values in a JSON mock file can reference variables through `${name}`:

```json
{ "id": "${id}", "title": "Report ${id}" }
```

```ts
await mocks.use([
  ["GET:/api/report", "utils/mocks/report.mock.json", { vars: { id: 42 } }],
]);
```

---

## Global HAR — `globalHar`

Record a HAR for a full page load, for example from `globalSetup`.

```ts
// global-setup.ts
import type { FullConfig } from "@playwright/test";
import { globalHar } from "@kavoxx/playwright-helper";

export default async function globalSetup(config: FullConfig) {
  await globalHar(config, {
    url: "/flex-reports-portal/reports/1237/edit",
    patterns: ["/**/api/**"],
    globalHarPath: "tests/global.har.zip",
    waitForSelector: "[data-testid=report]",
    forceRewrite: false,
  });
}
```

### Options (`IGlobalHarOptions`)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `url` | `string` | — | Page URL passed through `getAppUrl` |
| `patterns` | `string[]` | `["/**/*.js"]` | Glob patterns for `recordHar.urlFilter` |
| `globalHarPath` | `string` | `"tests/global.har.zip"` | Destination HAR file |
| `waitForSelector` | `string` | — | Selector to wait for before finishing recording |
| `forceRewrite` | `boolean` | `false` | Re-record even if the HAR already exists |

`buildUrlFilterRegExp(patterns)` converts the glob patterns to the `RegExp` used by Playwright. Supported syntax:

- `*` — any number of characters except `/`
- `**` — any number of characters including `/`

The `config` argument is accepted for symmetry with Playwright configs and is currently not used.

> Note: only requests matching `patterns` are written to the HAR. Include your API patterns (for example `/**/api/**`) if you plan to replay API calls.

---

## XLSX comparison — `compareDownloadedXlsx`

Compares a downloaded `.xlsx` file with a reference file on disk. If the reference does not exist yet, the downloaded file is saved as the reference.

```ts
import { test } from "@playwright/test";
import { compareDownloadedXlsx } from "@kavoxx/playwright-helper";

test("export report to xlsx", async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export" }).click(),
  ]);

  await compareDownloadedXlsx(download, "tests/expected/report.xlsx");
});
```

`compareDownloadedXlsx(download, fileName, simpleEqual?)`:

- `download` — Playwright `Download`.
- `fileName` — path to the reference file.
- `simpleEqual` — when `true`, compares raw JSON strings; otherwise performs a deep equality check (default `false`).

Workbook creation/modification timestamps are ignored during comparison.

---

## Test helpers — `test.helper`

### Annotations

```ts
addTestAnnotation(testInfo, "smoke");
addTestAnnotation(testInfo, { type: "Behavior", description: "opens the report" });
addTestBehavior(testInfo, ["step one", "step two"]);
```

### Scrolling

```ts
await scrollBodyTop(page, -1000);
await scrollElement(locator, { top: 100, left: 0 });
await scrollElementByLocator(locator, { scrollTop: 100 });
```

### Alerts

```ts
await waitForAlertsOnPage(page);
await removeAllAlertsOnPage(page);
```

### Screenshots

```ts
import { clientScreenshotOptions, makeScreenshotResolutions } from "@kavoxx/playwright-helper";

await makeScreenshotResolutions(page, testInfo);

// with screenshot options and a delay between captures
await makeScreenshotResolutions(page, testInfo, true, {
  ...clientScreenshotOptions(page),
  delay: 300,
  maxDiffPixelRatio: 0.01,
  useTitle: true,
});
```

`makeScreenshotResolutions(locator, testInfo, waitLoadState?, opts?)` captures the same target at `1024x768`, `1920x1080`, `2048x1080` and `3840x2160` and restores the original viewport afterwards.

- `opts` — Playwright `PageAssertionsToHaveScreenshotOptions` plus `delay` (ms between captures) and `useTitle` (prefix file names with the test title).

### Theme

```ts
await setInitTheme(page, "app_theme", "app_dark_theme");
await switchTheme(page, "adm");

test.beforeEach(themeSwitcher({ themeKey: "app_theme", darkValue: "app_dark_theme" }));
```

### Network recorder mode

```ts
import { networkRecorderAuthHook } from "@kavoxx/playwright-helper";

test.beforeEach(networkRecorderAuthHook({}));
```

`networkRecorderAuthHook({ login?, password?, host?, authUri?, skipAuth? })` returns a `beforeEach` hook that, for projects whose name contains `network-recorder`, logs in via `authUri` and copies the resulting cookies into the page context. Credentials are taken from the arguments or from `PW_LOGIN` / `PW_PASSWORD`; if neither is set the hook throws.

```ts
isNetworkRecorder();                         // is the recorder active
await networkRecorderWait(page, 1000, true); // wait (recorder-aware)
```

`networkRecorder` is a deprecated shorthand for `networkRecorderAuthHook({})`.

### Extended `expect`

The package exports an extended `expect` whose `toHaveScreenshot` is skipped for the `network-recorder` project, so recording runs do not fail on missing snapshots.

### Misc

```ts
await disableSpellcheck(page);
```

---

## Playwright utilities — `playwright.utils`

Mouse emulation that works from a `Locator` (no drag-and-drop, only press/release):

```ts
await mouseOver(locator, { x: 5, y: 5 });
await mouseClick(locator);
await mouseDown(locator);
await mouseUp(page);
await removeMouse(page);
```

Other helpers:

```ts
await wait(page, 500, true);        // delay + optional networkidle wait
await delay(200);                   // plain promise delay
await removeFocus(page);
await focusWithTab(page, true);     // Shift+Tab
await pressSequence(page, "Control+A", "Backspace");
await changeTheme(page, "dark");    // window.setTheme for storybook
const clip = await getScreenClip(locator, { top: 10, right: 10 });
```

Constants `DEMO_HOST` and `DEMO_PORT` are derived from `process.env.DEMO_HOST` (default `localhost`) and `process.env.DEMO_PORT` (default `3000`).

---

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `DEMO_HOST` | `localhost` | Host used by `getAppUrl` / `DEMO_HOST` |
| `DEMO_PORT` | `3000` | Port used by `getAppUrl` / `DEMO_PORT` |
| `PW_LOGIN` | — | Login for `networkRecorderAuthHook` |
| `PW_PASSWORD` | — | Password for `networkRecorderAuthHook` |

`getAppUrl(path?)` returns `http://<DEMO_HOST>:<DEMO_PORT><path>` and is used as the default base for API URL patterns. `networkRecorderAuthHook({ host })` can override the host for a run.

---

## Changelog

### 1.54.2-alpha.52

- Migrated XLSX comparison from `exceljs` to `xlsx-js-style`.
- Added `globalHar` and `buildUrlFilterRegExp`.
- Fixed `**` handling in glob-to-regex conversion and `mockUrl` matching in `MockServerHelper`.
- `networkRecorderAuthHook` now requires `PW_LOGIN` / `PW_PASSWORD` and documents the actual behaviour.
- `makeScreenshotResolutions` forwards screenshot options and uses a Latin `x` in file names.
- Added `.npmrc` to `.gitignore`.

### 1.54.2-alpha.35

- Added `MockServerHelper.forceUse()`, which ignores network recorder mode.
- Added the `MockServerHelperOptions['mockUrl']` option (default `getAppUrl("/**/api/**")`).

### 1.54.2-alpha.30

- Added the `har/[METHOD:URL (#N)]` mock specifier to replay a specific HAR entry body.

### 1.54.2-alpha.28

- `MockServerHelper.use` no longer applies mocks while in network recorder mode.

### 1.54.2-alpha.26

- Added the `delay` option to `makeScreenshotResolutions`.

### 1.54.2-alpha.24

- Added `networkRecorderWait` and `isNetworkRecorder`.
