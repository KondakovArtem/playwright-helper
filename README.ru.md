# @kavoxx/playwright-helper

[English](README.md) | **Русский**

Библиотека вспомогательных функций для e2e-тестирования с [Playwright](https://playwright.dev/): мокирование API, запись и воспроизведение HAR, хелперы скриншотов, сравнение XLSX и небольшие тестовые утилиты.

## Возможности

- **Мокирование API** — запись/воспроизведение HAR, подмена эндпоинтов JSON-файлами или данными в коде, блокировка незамоканных API-вызовов, мониторинг сетевых и консольных ошибок.
- **Глобальный HAR** — запись HAR для полной загрузки страницы прямо из конфигурации Playwright.
- **Сравнение XLSX** — сравнение скачанного `.xlsx` с эталоном; эталон создаётся при первом запуске.
- **Хелперы скриншотов** — один и тот же скриншот в нескольких разрешениях.
- **Режим network-recorder** — хук авторизации и пропуск проверки скриншотов при записи HAR.
- **Утилиты Playwright** — эмуляция мыши, ожидания, скролл, работа с фокусом, фиксированные часы, аннотации тестов.

## Установка

```bash
npm install @kavoxx/playwright-helper
```

или

```bash
yarn add @kavoxx/playwright-helper
```

Пакет требует `@playwright/test`; проверен на версии `1.54.2`.

## Использование

Импортируйте нужное из корня пакета:

```ts
import {
  MockServerHelper,
  globalHar,
  compareDownloadedXlsx,
  networkRecorderAuthHook,
} from "@kavoxx/playwright-helper";
```

---

## Мокирование API — `MockServerHelper`

`MockServerHelper` связывает `page` теста с HAR-файлом, позволяет подменять отдельные эндпоинты и проверять, какие API-вызовы были выполнены.

### Инициализация

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

`MockServerHelper.init(page, testInfo, opts?)` создаёт хелпер и вызывает `routeFromHAR()` с вычисленным `mockUrl`.

Передача `true`/`false` вместо объекта опций — сокращение для включения/отключения поведения по умолчанию:

```ts
const mocks = await MockServerHelper.init(page, testInfo, true);
```

### Опции (`MockServerHelperOptions`)

| Опция | Тип | По умолчанию | Описание |
| --- | --- | --- | --- |
| `fixedTime` | `string \| boolean` | `true` | Устанавливает фиксированные часы (`2024-02-02T10:00:00` при `true`) |
| `monitorNetworkError` | `boolean` | `true` | Собирает неудавшиеся запросы |
| `strictApiCall` | `boolean` | `true` | Обрывает API-вызовы, которые не были замоканы |
| `useAuth` | `boolean` | `false` | Зарезервированный флаг авторизации |
| `zipHAR` | `boolean` | `false` | Читает HAR из `.zip`-файла |
| `harName` | `string` | `"har"` | Имя HAR-файла в каталоге snapshots |
| `mockUrl` | `string \| RegExp` | `getAppUrl("/**/api/**")` | URL-паттерн для HAR-роутинга и определения незамоканных вызовов |

Путь к HAR вычисляется по файлу и названию теста:

```
<файл теста>-snapshots/<название теста через дефисы>/har/<harName>[.zip]
```

### Подмена эндпоинтов — `use`, `forceUse`

```ts
await mocks.use([
  // JSON-файл рядом с файлом теста
  ["GET:/ekp-user-service/api/auth/check", "utils/mocks/auth.mock.json"],

  // JSON прямо в коде
  ["GET:/ekp-presentations/api/Presentations", [{ id: 1 }, { id: 2 }]],

  // Свой обработчик
  [
    "POST:/ekp-report-management/api/DataEngine/excel",
    async (route, { resolveMockFile }) => {
      await resolveMockFile(route, "utils/mocks/report.mock.json");
    },
  ],

  // Тело ответа из записанной записи HAR
  [
    "GET:/ekp-presentations/api/Presentations/301",
    "har/[GET:/ekp-presentations/api/Presentations/301 (#2)]",
  ],
]);
```

Каждый элемент — кортеж `UseApi`: `[url, response, opts?]`.

- `url` — `"<METHOD>:<path>"`, например `"GET:/api/users"`.
- `response` — путь к файлу, данные в коде или функция-обработчик.
- `opts` — `{ times?, vars?, delay? }`.

Варианты `response`:

- Строковый путь к `.json`-файлу — относительные пути отсчитываются от каталога теста, остальные — от корня пакета. JSON-файлы поддерживают подстановку переменных (см. ниже). `har/<fileName>` читает файл из каталога HAR.
- `har/[METHOD:URL]` / `har/[METHOD:URL (#N)]` — воспроизводит тело соответствующей записи HAR. Без `(#N)` берётся первое совпадение.
- `object`/`array` в коде — отдаётся как JSON.
- Функция `(route, utils) => Promise<void>` — полный контроль; `utils.resolveMockFile(route, path, { vars, delay })` переиспользует логику работы с файлами.

`use` автоматически пропускается во время записи HAR (режим network-recorder). `forceUse` применяет моки независимо от режима.

### Проверки

```ts
await mocks.expectApiCalls();                 // сравнение с записанным HAR
await mocks.expectApiCalls({ "GET:/api/x": "200" }, { "POST:/api/y": "204" });

await mocks.expectNetworkError();             // нет неудавшихся запросов
await mocks.expectConsole();                  // нет ошибок в консоли

mocks.apiCalls;                               // копия записанных вызовов
await mocks.clearApiCalls();                  // сброс записанных вызовов
```

`expectApiCalls(expected?, auxExpected?)` принимает необязательную ожидаемую карту; иначе она строится из HAR плюс необязательной карты `auxExpected`.

### Прочие методы

- `mocks.strictApiCall()` — обрывать незамоканные API-вызовы (по умолчанию подключается автоматически).
- `mocks.monitorNetworkError()` / `mocks.monitorConsole(types?)` — включить мониторинг (по умолчанию подключается автоматически).
- `mocks.useAuth(mock?, force?)` — замокать эндпоинты проверки авторизации.
- `mocks.setFixedTime(time?)` — установить фиксированные часы.
- `mocks.cleanUse()` — снять все роуты, зарегистрированные на странице (`unrouteAll`).
- `mocks.waitDebug()` — оставить страницу открытой для отладки.
- `MockServerHelper.getHarPath(testInfo, opts)` / `MockServerHelper.getHarFilePath(testInfo, opts, fileName)` — вычислить пути к HAR.

### Переменные в mock-файлах

Строковые значения в JSON-моке могут ссылаться на переменные через `${name}`:

```json
{ "id": "${id}", "title": "Report ${id}" }
```

```ts
await mocks.use([
  ["GET:/api/report", "utils/mocks/report.mock.json", { vars: { id: 42 } }],
]);
```

---

## Глобальный HAR — `globalHar`

Запись HAR для полной загрузки страницы, например из `globalSetup`.

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

### Опции (`IGlobalHarOptions`)

| Опция | Тип | По умолчанию | Описание |
| --- | --- | --- | --- |
| `url` | `string` | — | URL страницы, прогоняется через `getAppUrl` |
| `patterns` | `string[]` | `["/**/*.js"]` | Glob-паттерны для `recordHar.urlFilter` |
| `globalHarPath` | `string` | `"tests/global.har.zip"` | Куда сохранять HAR |
| `waitForSelector` | `string` | — | Селектор, который нужно дождаться до завершения записи |
| `forceRewrite` | `boolean` | `false` | Перезаписывать HAR, даже если он уже существует |

`buildUrlFilterRegExp(patterns)` преобразует glob-паттерны в `RegExp` для Playwright. Поддерживаемый синтаксис:

- `*` — любое количество символов, кроме `/`
- `**` — любое количество символов, включая `/`

Аргумент `config` принимается для совместимости с конфигурацией Playwright и сейчас не используется.

> Внимание: в HAR попадают только запросы, попадающие под `patterns`. Добавьте паттерны API (например, `/**/api/**`), если планируете воспроизводить API-вызовы.

---

## Сравнение XLSX — `compareDownloadedXlsx`

Сравнивает скачанный `.xlsx` с эталонным файлом на диске. Если эталона нет, скачанный файл сохраняется как эталон.

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
- `fileName` — путь к эталонному файлу.
- `simpleEqual` — при `true` сравниваются сырые JSON-строки, иначе выполняется глубокое сравнение (по умолчанию `false`).

Время создания/изменения книги игнорируется при сравнении.

---

## Тестовые хелперы — `test.helper`

### Аннотации

```ts
addTestAnnotation(testInfo, "smoke");
addTestAnnotation(testInfo, { type: "Поведение", description: "открывает отчёт" });
addTestBehavior(testInfo, ["шаг один", "шаг два"]);
```

### Скролл

```ts
await scrollBodyTop(page, -1000);
await scrollElement(locator, { top: 100, left: 0 });
await scrollElementByLocator(locator, { scrollTop: 100 });
```

### Алерты

```ts
await waitForAlertsOnPage(page);
await removeAllAlertsOnPage(page);
```

### Скриншоты

```ts
import { clientScreenshotOptions, makeScreenshotResolutions } from "@kavoxx/playwright-helper";

await makeScreenshotResolutions(page, testInfo);

// с опциями скриншота и задержкой между снимками
await makeScreenshotResolutions(page, testInfo, true, {
  ...clientScreenshotOptions(page),
  delay: 300,
  maxDiffPixelRatio: 0.01,
  useTitle: true,
});
```

`makeScreenshotResolutions(locator, testInfo, waitLoadState?, opts?)` делает снимки одной цели в разрешениях `1024x768`, `1920x1080`, `2048x1080` и `3840x2160`, после чего возвращает исходный viewport.

- `opts` — Playwright `PageAssertionsToHaveScreenshotOptions` плюс `delay` (мс между снимками) и `useTitle` (префикс из названия теста в именах файлов).

### Тема

```ts
await setInitTheme(page, "app_theme", "app_dark_theme");
await switchTheme(page, "adm");

test.beforeEach(themeSwitcher({ themeKey: "app_theme", darkValue: "app_dark_theme" }));
```

### Режим network-recorder

```ts
import { networkRecorderAuthHook } from "@kavoxx/playwright-helper";

test.beforeEach(networkRecorderAuthHook({}));
```

`networkRecorderAuthHook({ login?, password?, host?, authUri?, skipAuth? })` возвращает хук для `beforeEach`, который для проектов, чьё имя содержит `network-recorder`, логинится через `authUri` и копирует полученные cookies в контекст страницы. Учётные данные берутся из аргументов или из `PW_LOGIN` / `PW_PASSWORD`; если не задано ни то, ни другое — хук бросает ошибку.

```ts
isNetworkRecorder();                         // активен ли режим записи
await networkRecorderWait(page, 1000, true); // ожидание (учитывает режим)
```

`networkRecorder` — устаревшее сокращение для `networkRecorderAuthHook({})`.

### Расширенный `expect`

Пакет экспортирует расширенный `expect`, у которого `toHaveScreenshot` пропускается для проекта `network-recorder`, чтобы запуски записи не падали из-за отсутствующих эталонных скриншотов.

### Разное

```ts
await disableSpellcheck(page);
```

---

## Утилиты Playwright — `playwright.utils`

Эмуляция мыши, работающая от `Locator` (без drag-and-drop, только нажатие/отпускание):

```ts
await mouseOver(locator, { x: 5, y: 5 });
await mouseClick(locator);
await mouseDown(locator);
await mouseUp(page);
await removeMouse(page);
```

Другие хелперы:

```ts
await wait(page, 500, true);        // задержка + опциональное ожидание networkidle
await delay(200);                   // обычная задержка промисом
await removeFocus(page);
await focusWithTab(page, true);     // Shift+Tab
await pressSequence(page, "Control+A", "Backspace");
await changeTheme(page, "dark");    // window.setTheme для storybook
const clip = await getScreenClip(locator, { top: 10, right: 10 });
```

Константы `DEMO_HOST` и `DEMO_PORT` берутся из `process.env.DEMO_HOST` (по умолчанию `localhost`) и `process.env.DEMO_PORT` (по умолчанию `3000`).

---

## Переменные окружения

| Переменная | По умолчанию | Описание |
| --- | --- | --- |
| `DEMO_HOST` | `localhost` | Хост, используемый `getAppUrl` / `DEMO_HOST` |
| `DEMO_PORT` | `3000` | Порт, используемый `getAppUrl` / `DEMO_PORT` |
| `PW_LOGIN` | — | Логин для `networkRecorderAuthHook` |
| `PW_PASSWORD` | — | Пароль для `networkRecorderAuthHook` |

`getAppUrl(path?)` возвращает `http://<DEMO_HOST>:<DEMO_PORT><path>` и используется как база для URL-паттернов API. `networkRecorderAuthHook({ host })` может переопределить хост для запуска.

---

## История изменений

### 1.54.2-alpha.52

- Сравнение XLSX переведено с `exceljs` на `xlsx-js-style`.
- Добавлены `globalHar` и `buildUrlFilterRegExp`.
- Исправлена обработка `**` при преобразовании glob в regex и сопоставление `mockUrl` в `MockServerHelper`.
- `networkRecorderAuthHook` теперь требует `PW_LOGIN` / `PW_PASSWORD`, документация приведена к фактическому поведению.
- `makeScreenshotResolutions` прокидывает опции скриншота и использует латинскую `x` в именах файлов.
- `.npmrc` добавлен в `.gitignore`.

### 1.54.2-alpha.35

- Добавлен `MockServerHelper.forceUse()`, игнорирующий режим network-recorder.
- Добавлена опция `MockServerHelperOptions['mockUrl']` (по умолчанию `getAppUrl("/**/api/**")`).

### 1.54.2-alpha.30

- Добавлен спецификатор мока `har/[METHOD:URL (#N)]` для воспроизведения тела конкретной записи HAR.

### 1.54.2-alpha.28

- `MockServerHelper.use` больше не применяет моки в режиме network-recorder.

### 1.54.2-alpha.26

- В `makeScreenshotResolutions` добавлена опция `delay`.

### 1.54.2-alpha.24

- Добавлены `networkRecorderWait` и `isNetworkRecorder`.
