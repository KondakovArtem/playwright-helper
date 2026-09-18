import { Page, Route, TestInfo, expect } from "@playwright/test";
import { minimatch } from "minimatch";
import { existsSync, readFileSync } from "node:fs";
// Импортируем необходимые классы и функции из Playwright
import { dirname, extname, resolve, join } from "node:path";
import * as yauzl from "yauzl";

// Импортируем функции для работы с путями
import { readFile } from "node:fs/promises";

// Импортируем функцию для чтения файлов асинхронно
import { wait } from "./playwright.utils";
import { getAppUrl, isNetworkRecorder } from "./test.helper";
import { Variables, replaceVariablesInJson } from "./util";

const defaulMockUrl = "/**/api/**";

type RouteHarOptions = NonNullable<Parameters<Page["routeFromHAR"]>[1]>;

function getFileFromZip(
  zipFilePath: string,
  fileName: string
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        console.error(err);

        return resolve(null);
      }

      zipfile.readEntry();

      zipfile.on("entry", (entry) => {
        if (entry.fileName === fileName) {
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              console.error(err);

              return resolve(null);
            }

            let fileContent = "";
            readStream.on("data", (chunk) => {
              fileContent += chunk.toString();
            });

            readStream.on("end", () => {
              resolve(fileContent);
            });

            readStream.on("error", (streamErr) => {
              console.error(streamErr);
              resolve(null);
            });

            return null;
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on("end", () => {
        // Файл не найден
        resolve(null);
      });

      zipfile.on("error", (zipErr) => {
        console.error(zipErr);
        resolve(null);
      });

      return null;
    });
  });
}

// Импортируем константы для хоста и порта

export type ResponseUtils = {
  resolveMockFile(route: Route, path: string): Promise<void>;
};

async function delayFn(count: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), count);
  });
}

export type ResponseFn = (route: Route, utils: ResponseUtils) => Promise<void>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any

type ResponseData = any[] | Record<string, any>;

type ResponseMeta = { times?: number; vars?: Variables; delay?: number };

// Тип для обозначения API URL и соответствующего результата
export type UseApi = [
  url: string,
  response: string | ResponseFn | ResponseData,
  opts?: ResponseMeta
];
// Тип для обозначения уровня логирования в консоли
type ConsoleLogType = "error" | "warning" | "debug";

interface MockServerHelperOptions {
  /** установки фиксированного времени на странице default - true */
  fixedTime?: string | boolean;
  /** Записывает неудавшиеся запросы в массив default - true */
  monitorNetworkError?: boolean;
  /** блокирует доступ к незамоканным API и возвращает ошибку. default - true  */
  strictApiCall?: boolean;
  /** Возвращает замоканный ответ для проверки аутентификации default - true */
  useAuth?: boolean;
  zipHAR?: boolean;
  harName?: string;
  /** URL-паттерн для мокирования API запросов default - getAppUrl("/\**\/api/**") */
  mockUrl?: RouteHarOptions["url"];
}

export class MockServerHelper {
  static getHarPath(testInfo: TestInfo, opts: MockServerHelperOptions) {
    const { title, file } = testInfo;

    return `${file}-snapshots/${title.replaceAll(" ", "-")}/har/${
      opts.harName ?? "har"
    }${opts.zipHAR ? ".zip" : ""}`;
  }

  static getHarFilePath(
    testInfo: TestInfo,
    opts: MockServerHelperOptions,
    fileName: string
  ) {
    const harPath = MockServerHelper.getHarPath(testInfo, opts);
    return join(dirname(harPath), fileName);
  }

  private readonly har?: Promise<
    | {
        log: {
          entries: {
            request: { url: string; method: string };
            response: { status: number };
          }[];
        };
      }
    | undefined
  >;

  private zipPromises: Record<string, Promise<any>> = {};

  private async getHarFile(fileName: string) {
    const path = MockServerHelper.getHarPath(this.testInfo, this.opts);
    if (!this.zipPromises[fileName]) {
      this.zipPromises[fileName] = (async () => {
        if (existsSync(path)) {
          let content: string | null = null;
          if (extname(path) === ".zip") {
            content = await getFileFromZip(path, fileName);
          } else {
            content = readFileSync(
              MockServerHelper.getHarFilePath(
                this.testInfo,
                this.opts,
                fileName
              ),
              "utf-8"
            );
          }
          if (!content) {
            return undefined;
          }

          return content;
        }
        return undefined;
      })();
    }
    return this.zipPromises[fileName];
  }

  async getHarContent() {
    const content = await this.getHarFile(this.opts.zipHAR ? "har.har" : "har");
    if (content) {
      return JSON.parse(content);
    }
    return undefined;
  }

  /**
   * Извлекает body ответа из HAR по спецификатору вида:
   *   har/[GET:/path/to/api]
   *   har/[GET:/path/to/api (#2)]
   * Возвращает строковое тело и флаг, является ли оно JSON.
   */
  private async getBodyFromHarSpecifier(
    specifier: string
  ): Promise<{ body: string; harFile: string }> {
    const match = /^har\/\[(.+)\]$/.exec(specifier.trim());
    if (!match) {
      throw new Error(`Неверный формат спецификатора HAR: ${specifier}`);
    }

    const wantedKey = match[1];

    const har = await this.getHarContent();
    if (!har) {
      throw new Error("HAR содержимое не найдено");
    }

    const entries: Array<{
      request: { url: string; method: string };
      response: {
        status: number;
        content?: {
          mimeType?: string;
          text?: string;
          encoding?: string;
          _file?: string;
        };
      };
    }> = har?.log?.entries ?? [];

    // Генерируем ключи по той же логике, что и в expectApiCalls
    let found: (typeof entries)[number] | undefined;
    let generatedKey = "";
    const keyCounter: Record<string, number> = {};

    for (const entry of entries) {
      const baseKey = `${entry.request.method}:${entry.request.url}`.replace(
        getAppUrl(),
        ""
      );
      const count = (keyCounter[baseKey] ?? 0) + 1;
      keyCounter[baseKey] = count;
      generatedKey = count === 1 ? baseKey : `${baseKey} (#${count})`;

      if (generatedKey === wantedKey) {
        found = entry;
        break;
      }
    }

    if (!found) {
      throw new Error(`Запись в HAR не найдена по ключу: ${wantedKey}`);
    }

    const content = found.response?.content ?? {};
    if (!content._file) {
      throw new Error(`Не найден контент для HAR запроса ${wantedKey}`);
    }

    const body = await this.getHarFile(content._file);
    if (body === undefined) {
      throw new Error(`Файл тела из HAR не найден: ${content._file}`);
    }
    return { body, harFile: content._file };
  }

  static async init(
    page: Page,
    testInfo: TestInfo,
    opts: MockServerHelperOptions | boolean = true
  ) {
    let mockUrl: string | RegExp = getAppUrl(defaulMockUrl);
    mockUrl = (typeof opts === "object" ? opts.mockUrl : mockUrl) ?? mockUrl;

    const msH = new MockServerHelper(page, testInfo, opts);
    await msH.routeFromHAR(undefined, {
      url: mockUrl, // Capture all requests, or specify a glob pattern for specific URLs
      update: isNetworkRecorder(),
    });

    return msH;
  }

  public async routeFromHAR(harName?: string, opts?: RouteHarOptions) {
    const { testInfo } = this;
    await this.page.routeFromHAR(
      MockServerHelper.getHarPath(testInfo, {
        ...this.opts,
        harName: harName ?? this.opts?.harName,
      }),
      {
        ...opts,
        update: isNetworkRecorder(),
      }
    );
  }

  // Путь к директории теста
  private readonly directory: string = "";

  // Массив для хранения неудачных запросов
  private readonly failedRequests: string[] = [];

  // Массив для хранения сообщений консоли
  private readonly consoleLog: string[] = [];

  public readonly opts: MockServerHelperOptions;

  // Конструктор класса, принимает объект страницы и информацию о тесте
  constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo,
    opts: MockServerHelperOptions | boolean = true
  ) {
    this.directory = dirname(testInfo.file); // Определяем директорию на основе файла теста

    if (typeof opts === "boolean") {
      opts = {
        fixedTime: opts,
        monitorNetworkError: opts,
        strictApiCall: opts,
        useAuth: false,
      };
    }
    opts = {
      ...opts,
      fixedTime: opts.fixedTime ?? true,
      monitorNetworkError: opts.monitorNetworkError ?? true,
      strictApiCall: opts.strictApiCall ?? true,
      useAuth: opts.useAuth ?? false,
      zipHAR: opts.zipHAR ?? false,
    };

    this.opts = opts;

    const { fixedTime, monitorNetworkError, strictApiCall } = opts;

    this.spyApiCall();
    this.monitorConsole();

    if (fixedTime) {
      this.setFixedTime(typeof fixedTime === "string" ? fixedTime : undefined);
    }
    if (monitorNetworkError ?? true) {
      this.monitorNetworkError();
    }
    if (strictApiCall ?? true) {
      this.strictApiCall();
    }
  }

  /**
   * Метод для строгой обработки API вызовов,
   * который блокирует доступ к незамоканным API и возвращает ошибку.
   */
  public async strictApiCall() {
    if (this.testInfo.project.name.includes("network-recorder")) {
      console.log("Skip strictApi Call for networkRecorder");

      return;
    }

    let mockUrl: string | RegExp = getAppUrl(defaulMockUrl);
    mockUrl =
      (typeof this.opts === "object" ? this.opts.mockUrl : mockUrl) ?? mockUrl;

    await this.page.route(mockUrl, async (route) => {
      return route.abort("accessdenied"); // Блокировка запроса с сообщением об ошибке доступа
    });
  }

  private _apiCalls: Record<string, string> = {};

  private spyApiCall() {
    this.page.on("request", async (request) => {
      const uri = this.isApiMockUrl(request.url());
      if (uri) {
        const uriUid = `${request.method()}:${uri}`;
        let uid = uriUid;
        let idx = 1;
        const response = `${(await request.response())?.status() ?? 418}`;
        while (this._apiCalls[uid]) {
          idx += 1;
          uid = `${uriUid} (#${idx})`;
        }
        this._apiCalls[uid] = response;
      }
    });
  }

  private isApiMockUrl(url: string): string | undefined {
    const host = getAppUrl();
    const path = url.startsWith(host) ? url.replace(host, "") : url;

    const pattern = this.opts?.mockUrl ?? defaulMockUrl;

    if (pattern instanceof RegExp) {
      if (pattern.test(url) || pattern.test(path)) {
        return path.startsWith("http") ? path.replace(host, "") : path;
      }
      return undefined;
    }

    if (
      minimatch(path, pattern, { dot: true }) ||
      minimatch(url, pattern, { dot: true })
    ) {
      return path;
    }
    return undefined;
  }

  /**
   * Метод для обработки аутентификации пользователя.
   * Возвращает замоканный ответ для проверки аутентификации.
   */
  public async useAuth(
    mock: UseApi[1] = "utils/mocks/auth.mock.json",
    force = true
  ) {
    console.log("using auth");

    await this[force ? "forceUse" : "use"](
      [`GET:/ekp-user-service/api/auth/check`, mock],
      [
        `GET:/ekp-management/api/Settings?Category=ekp_management_service_auth`,
        "utils/mocks/auth.settings.mock.json",
      ]
    );
  }

  public cleanUse() {
    return this.page.unrouteAll();
  }

  /**
   * Метод для обработки нескольких API вызовов.
   * Принимает массив URL и соответствующих им ответов.
   * @param useApis - массив пар [url, response]
   */
  public async forceUse(...useApis: UseApi[]) {
    const { directory, page } = this;
    const resolveMockFile = async (
      route: Route,
      path: string,
      { vars, delay = 0 }: ResponseMeta = {}
    ) => {
      let body: string;
      let ext: string = "";

      if (path.startsWith("har")) {
        // Поддержка двух форматов:
        // 1) har/<filename> — читаем файл из каталога HAR
        // 2) har/[<METHOD:URL (#N)>] — ищем запись в har и берем связанное тело
        if (/^har\/\[.+\]$/.test(path)) {
          const { body: harBody, harFile } = await this.getBodyFromHarSpecifier(
            path
          );
          body = harBody;
          ext = extname(harFile);
        } else {
          ext = extname(path);
          body = await this.getHarFile(path.split("har/").join(""));
        }
      } else {
        if (!path.startsWith(".")) {
          path = resolve(__dirname, "../", path);
        } else {
          path = resolve(directory, path);
        }
        body = await readFile(path, "utf-8");
      }

      if (delay) {
        await delayFn(delay);
      }

      if (ext === ".json") {
        let json = JSON.parse(body);
        if (vars) {
          json = replaceVariablesInJson(json, vars);
        }

        return route.fulfill({ status: 200, json }); // Возвращаем успешный ответ с замоканными данными
      }

      return route.fulfill({ status: 200, body }); // Возвращаем успешный ответ с замоканными данными
    };

    await Promise.all(
      useApis.map(async ([urlRaw, response, opts = {}]) => {
        const { times, delay } = opts;
        const [type, ...urlData] = urlRaw.split(":");
        const url = urlData.join(":");

        await page.route(
          getAppUrl(url),
          async (route) => {
            // Если метод запроса не соответствует ожидаемому, передаем его дальше
            if (route.request().method() !== type) {
              return route.fallback();
            }
            console.log(`request ${type}`, getAppUrl(url));
            // Читаем замоканные данные из указанного файла

            if (delay) {
              await delayFn(delay);
            }

            if (typeof response === "string") {
              return resolveMockFile(route, response, opts);
            }
            if (typeof response === "function") {
              return response(route, { resolveMockFile });
            }
            if (Array.isArray(response)) {
              return route.fulfill({ status: 200, json: response });
            }

            if (typeof response === "object" || Array.isArray(response)) {
              return route.fulfill({ status: 200, json: response });
            }

            return route.abort();
          },
          { times }
        );
      })
    );
  }

  /**
   * Метод для обработки нескольких API вызовов.
   * Принимает массив URL и соответствующих им ответов.
   * @param useApis - массив пар [url, response]
   */
  public async use(...useApis: UseApi[]) {
    if (isNetworkRecorder()) {
      console.log("Skip using mocks in record network mode", useApis);
      return;
    }
    return this.forceUse(...useApis);
  }

  /**
   * Метод для мониторинга ошибок сети.
   * Записывает неудавшиеся запросы в массив.
   */
  public monitorNetworkError() {
    this.page.on("requestfailed", (request) => {
      console.error(
        "Запрос не удался:",
        request.method(),
        request.url(),
        request.failure()
      );
      this.failedRequests.push(
        `${request.url()} ${JSON.stringify(request.failure())}`
      );
    });
    this.page.on("requestfinished", async (request) => {
      const response = await request.response();
      if (response?.status() === 401) {
        console.error(
          "Запрос не авторизован:",
          request.url(),
          response?.status()
        );
        this.failedRequests.push(`${request.url()} ERR:${response?.status()}`);
      }
    });
  }

  /**
   * Метод для мониторинга сообщений консоли.
   * Записывает сообщения определенных типов в массив.
   * @param types - массив типов сообщений для мониторинга
   */
  public monitorConsole(types: ConsoleLogType[] = ["error"]) {
    this.page.on("console", (msg) => {
      if (types.includes(msg.type() as ConsoleLogType)) {
        this.consoleLog.push(msg.text()); // Добавляем текст сообщения в массив
      }
    });
  }

  /**
   * Метод для проверки наличия сетевых ошибок.
   * Сравнивает массив неудавшихся запросов с пустым массивом.
   */
  public async expectNetworkError(expected: string[] = []) {
    expect.soft(this.failedRequests).toEqual(expected);
  }

  /**
   * Метод для проверки наличия сообщений в консоли.
   * Сравнивает массив консольных сообщений с пустым массивом.
   */
  public async expectConsole(expected: string[] = []) {
    expect.soft(this.consoleLog).toEqual(expected);
  }

  /** Сверяет список выполненных запросов с ожидаемым и очищает кэш */
  public async expectApiCalls(
    expected?: Record<string, string>,
    auxExpected?: Record<string, string>
  ) {
    const harEntries = (((await this.getHarContent()) ?? {})?.log?.entries ??
      []) as {
      request: { url: string; method: string };
      response: { status: number };
    }[];

    const harCalls = harEntries.reduce((pre, { request, response }) => {
      const key = `${request.method}:${request.url}`.replace(getAppUrl(), "");
      let iterKey = key;
      let idx = 1;
      while (pre[iterKey]) {
        iterKey = `${key} (#${++idx})`;
      }
      pre[iterKey] = `${response.status}`;

      return pre;
    }, {} as Record<string, string>);

    expect
      .soft(this._apiCalls)
      .toEqual(expected ?? { ...harCalls, ...auxExpected });
  }

  /** Очистка списка выполненных запросов */
  public async clearApiCalls() {
    this._apiCalls = {};
  }

  public get apiCalls() {
    return { ...this._apiCalls };
  }

  /**
   * Метод для установки фиксированного времени на странице.
   * @param time - строка, представляющая фиксированное время
   */
  public async setFixedTime(time = "2024-02-02T10:00:00") {
    await this.page.clock.setFixedTime(new Date(time)); // Устанавливаем фиксированное время
    this.page.clock.install({ time });
  }

  /** Метод используется для возможности ваимодействия со страницей в режиме отладки, чтобы работали моки АПИ */
  public async waitDebug() {
    await wait(this.page, 999999);
  }
}
