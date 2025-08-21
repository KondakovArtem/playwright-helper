/* eslint-disable no-await-in-loop */

/* eslint-disable import/no-extraneous-dependencies */
import {
  APIRequestContext,
  Locator,
  Page,
  TestInfo,
  expect as baseExpect,
  PageAssertionsToHaveScreenshotOptions,
} from "@playwright/test";

import { DEMO_HOST, DEMO_PORT, mouseClick, wait } from "./playwright.utils";

/**
 * Добавляет аннотацию к тесту в объект TestInfo.
 * @param testInfo - Объект TestInfo, к которому добавляется аннотация.
 * @param data - Данные аннотации. Может быть строкой (только для описания) или объектом с полями `type` и `description`.
 */
export function addTestAnnotation(
  testInfo: TestInfo,
  data: { type?: string; description?: string } | string
) {
  if (typeof data === "string") {
    // Если data - строка, добавляем аннотацию с пустым типом.
    testInfo.annotations.push({ type: "", description: data });
  } else {
    // Если data - объект, добавляем аннотацию с указанными типом и описанием.
    testInfo.annotations.push({
      type: data.type ?? "",
      description: data.description,
    });
  }
}

export async function setInitTheme(page: Page, key: string, theme: string) {
  await page.addInitScript(`window.localStorage.setItem('${key}', '${theme}')`);
}

/**
 * Добавляет аннотации поведения теста в объект TestInfo. Обрабатывает строку или массив строк как входные данные.
 * @param testInfo - Объект TestInfo, к которому добавляются аннотации.
 * @param data - Строка или массив строк, представляющих описания поведения теста.
 */
export function addTestBehavior(testInfo: TestInfo, data: string | string[]) {
  if (!Array.isArray(data)) {
    data = [data]; // Приведение к массиву, если data - не массив.
  }

  data.forEach((description, idx) => {
    // Добавляем аннотацию для каждого описания поведения.
    addTestAnnotation(testInfo, {
      type: idx === 0 ? "Поведение" : "",
      description,
    });
  });
}

/**
 * Скроллит страницу вверх, чтобы компенсировать потенциальные несоответствия полосы прокрутки Firefox.
 * @param page - Объект страницы Playwright.
 * @param diff - Сумма скролла (по умолчанию -1000, скролл вверх).
 */
export async function scrollBodyTop(page: Page, diff = -1000) {
  await page.mouse.move(-1200, 0); // Перемещение мыши, чтобы избежать проблем с прокруткой.
  await page.mouse.wheel(0, diff); // Прокрутка страницы.
}

/**
 * Скроллит элемент, переданный через Locator, до заданной позиции по вертикали и/или горизонтали.
 * @param locator - Локатор элемента, который нужно прокрутить.
 * @param scroll - Объект с параметрами прокрутки (top и left).
 */
export async function scrollElement(
  locator: Locator,
  scroll: { top?: number; left?: number }
) {
  const page = locator.page();
  const el = await locator.elementHandle();
  if (el) {
    return page.evaluate(
      ({ el, scroll }) => {
        if (el && scroll.top !== undefined) {
          el.scrollTop = scroll.top;
        }
        if (el && scroll.left !== undefined) {
          el.scrollLeft = scroll.left;
        }
      },
      { el, scroll }
    );
  }

  return undefined;
}

/**
 * Скроллит элемент, переданный через Locator, до заданной позиции.
 * @param locator - Локатор элемента, который нужно прокрутить.
 * @param scroll - Объект с параметрами прокрутки (scrollTop и scrollLeft).
 */
export async function scrollElementByLocator(
  locator: Locator,
  scroll: { scrollTop?: number; scrollLeft?: number } = {}
) {
  await locator; // Ожидаем локатор.

  return locator.evaluate(
    (node, { scroll }) => {
      if (scroll.scrollTop !== undefined) node.scrollTop = scroll.scrollTop; // Устанавливаем scrollTop.
      if (scroll.scrollLeft !== undefined) node.scrollLeft = scroll.scrollLeft; // Устанавливаем scrollLeft.
    },
    { scroll }
  );
}

/**
 * Удаляет все предупреждения на странице.
 * @param page - Объект страницы Playwright.
 */
export async function removeAllAlertsOnPage(page: Page) {
  let alerts = await page.getByRole("alert").all(); // Получаем все элементы с ролью "alert".
  while (alerts.length) {
    await alerts[0].getByRole("button").click(); // Кликаем на кнопку закрытия первого предупреждения.
    alerts = await page.getByRole("alert").all(); // Обновляем список предупреждений.
  }
}

/**
 * Ожидает появления предупреждений на странице.
 * @param page - Объект страницы Playwright.
 */
export async function waitForAlertsOnPage(page: Page) {
  return page.waitForSelector("[role=alert]", { state: "visible" }); // Ожидаем, пока элемент с ролью "alert" станет видимым.
}

/**
 * Опции для создания скриншота клиента, включая маскирование определенных элементов.
 * @param page - Объект страницы Playwright.
 * @returns Опции для скриншота.
 */
export function clientScreenshotOptions(page: Page) {
  return {
    mask: [page.locator(".version-text")], // Маскируем элемент с классом "version-text".
  };
}

export async function makeScreenshotResolutions(
  locator: Locator | Page,
  testInfo: TestInfo,
  waitLoadState = true,
  opts?: PageAssertionsToHaveScreenshotOptions & {
    /** использовать название теста в наиеновании скриншота */
    useTitle?: boolean;
    /** задержка между формирование скриншотов */
    delay?: number;
  }
) {
  const page = (locator as Locator).page?.() ?? (locator as Page);
  const { delay = 500 } = opts ?? {};
  const { title } = testInfo;
  const { useTitle } = opts ?? {};

  const defSize = page.viewportSize();
  const pfx = `${useTitle ? `${title}-` : ""}`;

  await page.setViewportSize({ width: 1024, height: 768 });

  await wait(page, delay, waitLoadState);
  await expect.soft(locator).toHaveScreenshot(`${pfx}1024х768.png`);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await wait(page, delay, waitLoadState);
  await expect.soft(locator).toHaveScreenshot(`${pfx}1920х1080.png`);

  await page.setViewportSize({ width: 2048, height: 1080 });
  await wait(page, delay, waitLoadState);
  await expect.soft(locator).toHaveScreenshot(`${pfx}2048х1080.png`);

  await page.setViewportSize({ width: 3840, height: 2160 });
  await wait(page, delay, waitLoadState);
  await expect.soft(locator).toHaveScreenshot(`${pfx}3840х2016.png`);

  // await page.evaluate('document.body.style.zoom=2');
  // await wait(page, 500, true);
  // await expect.soft(page).toHaveScreenshot(`${title}-3840х2016х200.png`);
  // await page.evaluate('document.body.style.zoom=1');

  if (defSize) await page.setViewportSize(defSize);
}

/** фнукция переключает тему через интерфейс выпадающего списка действий */
export async function switchTheme(page: Page, name = "adm") {
  await mouseClick(page.getByText(name));
  await wait(page);
  await mouseClick(page.getByText("Сменить на темную тему"));
  await wait(page);
}

/**
 * Генерирует функцию-обёртку для установки темы приложения через localStorage,
 * если название проекта Playwright содержит "dark".
 * @param {Object} [options] - Опции для переключения темы.
 * @param {string} [options.themeKey="app_theme"] - Ключ для localStorage, в который будет записано значение темы.
 * @param {string} [options.darkValue="app_dark_theme"] - Значение для тёмной темы.
 * @returns {Function} Асинхронная функция, принимающая { page, testInfo }, устанавливающая тему при необходимости.
 */
export function themeSwitcher({
  themeKey,
  darkValue,
}: {
  themeKey?: string;
  darkValue?: string;
} = {}) {
  return async ({ page }: { page: Page }, testInfo: TestInfo) => {
    if (testInfo.project.name.includes("dark")) {
      await setInitTheme(
        page,
        themeKey ?? "app_theme",
        darkValue ?? "app_dark_theme"
      );
    }
  };
}

const APP_HOST = `${DEMO_HOST}:${DEMO_PORT}`;

export function getAppUrl(url = "") {
  return `${APP_HOST}${url}`;
}

/**
 * Хук для beforeEach. Используется для тестов с проектом network-recorder.
 * Выполняет авторизацию пользователя через API, сохраняет состояние сессии и добавляет cookies в контекст страницы.
 *
 * Алгоритм работы:
 * 1. Проверяет, что имя проекта теста содержит "network-recorder".
 * 2. Выполняет POST-запрос на эндпоинт авторизации с логином и паролем.
 * 3. Получает состояние хранилища (storageState) после авторизации.
 * 4. Добавляет полученные cookies в контекст страницы для эмуляции авторизованного пользователя.
 *
 * @param {{ page: Page; request: APIRequestContext }} param0 - Объект с page и request
 * @param {TestInfo} testInfo - Информация о тесте
 */
export async function networkRecorder(
  { page, request }: { page: Page; request: APIRequestContext },
  testInfo: TestInfo
) {
  await networkRecorderAuthHook({})({ page, request }, testInfo);
}

/**
 * Возвращает асинхронный хук авторизации для beforeEach, используемый в тестах с network-recorder.
 * Позволяет переопределять логин, пароль и путь до эндпоинта авторизации.
 *
 * Алгоритм работы возвращаемого хука:
 * 1. Проверяет, что имя проекта теста содержит "network-recorder".
 * 2. Выполняет POST-запрос на указанный эндпоинт авторизации с заданными логином и паролем.
 * 3. Получает состояние хранилища (storageState) после авторизации.
 * 4. Добавляет полученные cookies в контекст страницы для эмуляции авторизованного пользователя.
 *
 * @param {Object} params - Параметры хука
 * @param {string} [params.login="adm"] - Логин пользователя
 * @param {string} [params.password="luxmsbi"] - Пароль пользователя
 * @param {string} [params.host="/ekp-user-service/api/Auth/login"] - Путь до эндпоинта авторизации
 * @returns {Function} Асинхронная функция-хук для использования в beforeEach
 */
export function networkRecorderAuthHook({
  login,
  password,
  host,
}: {
  login?: string;
  password?: string;
  host?: string;
}) {
  login = login ?? "adm";
  password = password ?? "luxmsbi";
  host = host ?? "/ekp-user-service/api/Auth/login";
  return async (
    { page, request }: { page: Page; request: APIRequestContext },
    testInfo: TestInfo
  ) => {
    if (testInfo.project.name.includes("network-recorder")) {
      // APP_HOST = packageJson.proxy;
      networkRecorderFlag = true;
      await request.post(getAppUrl(host), {
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ userName: login, password }),
      });
      const state = await request.storageState();
      page.context().addCookies(state.cookies);
    }
  };
}

let networkRecorderFlag = false;

/**
 * Проверяет, активен ли режим network-recorder.
 * Используется для определения, выполняются ли тесты в специальном режиме network-recorder.
 *
 * @returns {boolean} true, если активен режим network-recorder, иначе false.
 */
export function isNetworkRecorder() {
  return networkRecorderFlag;
}

/**
 * Ожидает завершения сетевых операций для проекта network-recorder или выполняет стандартное ожидание.
 * Использует специальную задержку, если активен режим network-recorder.
 *
 * @param {Page} page - Объект страницы Playwright.
 * @param {number} [count=500] - Время ожидания в миллисекундах (по умолчанию 500).
 * @param {boolean} waitLoadState - Флаг ожидания состояния загрузки страницы.
 */
export async function networkRecorderWait(
  page: Page,
  count = 500,
  waitLoadState: boolean
) {
  await wait(page, isNetworkRecorder() ? count : 500, waitLoadState);
}

export const expect = baseExpect.extend({
  async toHaveScreenshot(page, ...args) {
    const projectName = (this as any)._stepInfo._testInfo.project.name;

    if (projectName === "network-recorder") {
      return {
        pass: true,
        message: () => `Screenshot comparison skipped for ${projectName}`,
      };
    }

    await baseExpect.soft(page).toHaveScreenshot(...args);

    return { pass: true, message: () => `Screenshot comparison` };
  },
});

export async function disableSpellcheck(page: Page) {
  return page.evaluate(() => {
    document.querySelectorAll("input[type=text], textarea").forEach((field) => {
      (field as HTMLElement).spellcheck = false;
    });
  });
}
