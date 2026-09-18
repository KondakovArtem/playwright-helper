import { FullConfig, chromium } from "@playwright/test";
import fs from "node:fs";
import { getAppUrl } from "./test.helper";

/**
 * Преобразует массив glob-паттернов в RegExp для urlFilter Playwright
 * Поддерживает:
 *   *   — любое количество символов, кроме слеша
 *   **  — любое количество символов включая слеш
 */
export function buildUrlFilterRegExp(patterns: string[]): RegExp {
  const regexes = patterns.map((pattern) => {
    // Экранируем все спецсимволы, кроме * (не трогаем звездочки)
    let escaped = pattern.replace(/([.+^${}()|[\]\\])/g, String.raw`\$1`);

    // За один проход: ** -> .* (любые символы, включая слеш), * -> [^/]* (один сегмент)
    escaped = escaped.replace(/\*\*|\*/g, (match) =>
      match === "**" ? ".*" : "[^/]*"
    );

    return escaped;
  });

  const finalRegex = regexes.join("|");

  return new RegExp(finalRegex, "i");
}

/**
 * Опции для функции {@link globalHar}.
 */
export interface IGlobalHarOptions {
  /**
   * Перезаписывать существующий HAR-файл, если он уже существует.
   * @default false
   */
  forceRewrite?: boolean;
  /** Список glob-паттернов для фильтрации URL при записи HAR. */
  patterns?: string[];
  /** CSS-селектор, который нужно дождаться перед завершением записи.
   * Полезно, если страница загружает данные асинхронно. */
  waitForSelector?: string;
  /** URL страницы, с которой начинается запись HAR. */
  url: string;
  /** ПУть до сохраненного har */
  globalHarPath?: string;
}

export async function globalHar(
  config: FullConfig,
  options: IGlobalHarOptions
) {
  const {
    forceRewrite,
    patterns = ["/**/*.js"],
    waitForSelector,
    url,
    globalHarPath = "tests/global.har.zip",
  } = options;
  // если HAR уже есть — не записываем заново
  if (fs.existsSync(globalHarPath)) {
    console.log("📦 HAR уже существует");
    if (!forceRewrite) {
      return;
    }
  }
  console.log("📦 Записываю HAR...");
  console.log("📦 Иcпользуем паттерны", patterns);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      recordHar: {
        path: globalHarPath,
        urlFilter: buildUrlFilterRegExp(patterns),
      },
    });
    const page = await context.newPage();
    const appUrl = getAppUrl(url);
    console.log("📦 Ожидаем загрузки страницы", appUrl);
    await page.goto(appUrl, { waitUntil: "networkidle" }); // твоя главная страница
    if (waitForSelector) {
      console.log("📦 Ожидаем элемент", waitForSelector);
      await page.waitForSelector(waitForSelector, { timeout: 60000 });
    }
    await context.close();
  } finally {
    await browser.close();
  }
  console.log("✅ HAR записан");
}
