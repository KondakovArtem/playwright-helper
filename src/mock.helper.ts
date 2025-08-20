import { Page, Route, TestInfo, expect } from "@playwright/test";
import { existsSync, readFileSync } from "fs";
// Импортируем необходимые классы и функции из Playwright
import { dirname, extname, resolve, join } from "path";
import * as yauzl from "yauzl";

// Импортируем функции для работы с путями
import { readFile } from "fs/promises";

// Импортируем функцию для чтения файлов асинхронно
import { wait } from "./playwright.utils";
import { getAppUrl } from "./test.helper";
import { Variables, replaceVariablesInJson } from "./util";

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
    const { title, file } = testInfo;
    const harPath = MockServerHelper.getHarPath(testInfo, opts);
    return join(dirname(harPath), fileName);
    // return join(
    //   `${file}-snapshots/${title.replaceAll(" ", "-")}`,
    //   "har",
    //   opts.harName ?? "har",
    //   fileName
    // );
  }

  private har?: Promise<
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
    // const path = MockServerHelper.getHarPath(this.testInfo, this.opts);
    // if (!this.har) {
    //   // eslint-disable-next-line no-async-promise-executor
    //   this.har = (async () => {
    //     if (existsSync(path)) {
    //       let content: string | null = null;
    //       if (extname(path) === ".zip") {
    //         content = await getFileFromZip(path, "har.har");
    //       } else {
    //         content = readFileSync(
    //           MockServerHelper.getHarPath(this.testInfo, this.opts),
    //           "utf-8"
    //         );
    //       }
    //       if (!content) {
    //         return undefined;
    //       }

    //       return JSON.parse(content);
    //     }

    //     return undefined;
    //   })();
    // }
    // return this.har;
  }

  static async init(
    page: Page,
    testInfo: TestInfo,
    opts: MockServerHelperOptions | boolean = true
  ) {
    const { project } = testInfo;
    const msH = new MockServerHelper(page, testInfo, opts);
    await page.routeFromHAR(MockServerHelper.getHarPath(testInfo, msH.opts), {
      url: getAppUrl("/**/api/**"), // Capture all requests, or specify a glob pattern for specific URLs
      // updateMode: 'minimal',
      update: project.name.includes("network-recorder"),
    });

    return msH;
  }

  // Путь к директории теста
  private directory = "";

  // Массив для хранения неудачных запросов
  private failedRequests: string[] = [];

  // Массив для хранения сообщений консоли
  private consoleLog: string[] = [];

  public readonly opts: MockServerHelperOptions;

  // Конструктор класса, принимает объект страницы и информацию о тесте
  constructor(
    private page: Page,
    private testInfo: TestInfo,
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
      fixedTime: opts.fixedTime ?? true,
      monitorNetworkError: opts.monitorNetworkError ?? true,
      strictApiCall: opts.strictApiCall ?? true,
      useAuth: opts.useAuth ?? false,
      zipHAR: opts.zipHAR ?? false,
      harName: opts.harName,
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
    // if (useAuth) {
    //   this.useAuth();
    // }
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

    await this.page.route(getAppUrl("/**/api/**"), async (route) => {
      return route.abort("accessdenied"); // Блокировка запроса с сообщением об ошибке доступа
    });
  }

  private _apiCalls: Record<string, string> = {};

  private async spyApiCall() {
    this.page.on("request", async (request) => {
      const uri = this.isApiUrl(request.url(), getAppUrl());
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

  private isApiUrl(url: string, host: string): string | undefined {
    // Проверяем, начинается ли URL с хоста и содержит ли /api/
    if (url.startsWith(host) && url.includes("/api/")) {
      // Убираем хост и возвращаем оставшуюся часть URL
      return url.replace(host, "");
    }

    // Возвращаем undefined, если условия не выполнены
    return undefined;
  }

  /**
   * Метод для обработки аутентификации пользователя.
   * Возвращает замоканный ответ для проверки аутентификации.
   */
  public async useAuth(mock: UseApi[1] = "utils/mocks/auth.mock.json") {
    console.log("using auth");

    await this.use(
      [`GET:/ekp-user-service/api/auth/check`, mock],
      [
        `GET:/ekp-management/api/Settings?Category=ekp_management_service_auth`,
        "utils/mocks/auth.settings.mock.json",
      ]
    );

    // await this.page.route(
    //   `${DEMO_HOST}:${DEMO_PORT}/ekp-user-service/api/Auth/check`,
    //   async (route) => {
    //     // Если метод запроса не GET, просто передаем его дальше
    //     if (route.request().method() !== 'GET') {
    //       return route.fallback();
    //     }
    //     // Читаем замоканные данные из JSON файла
    //     const json = JSON.parse(
    //       await readFile(resolve(__dirname, mock), 'utf-8')
    //     );

    //     return route.fulfill({ status: 200, json }); // Возвращаем успешный ответ с замоканными данными
    //   }
    // );
  }

  public cleanUse() {
    return this.page.unrouteAll();
  }

  /**
   * Метод для обработки нескольких API вызовов.
   * Принимает массив URL и соответствующих им ответов.
   * @param useApis - массив пар [url, response]
   */
  public async use(...useApis: UseApi[]) {
    const { directory, page } = this;

    const resolveMockFile = async (
      route: Route,
      path: string,
      { vars, delay = 0 }: ResponseMeta = {}
    ) => {
      let body: string;
      const ext = extname(path);

      if (path.indexOf("har") === 0) {
        body = await this.getHarFile(path.split("har/").join(""));
      } else {
        if (path[0] !== ".") {
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
   * Метод для мониторинга ошибок сети.
   * Записывает неудавшиеся запросы в массив.
   */
  public async monitorNetworkError() {
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
  public async monitorConsole(types: ConsoleLogType[] = ["error"]) {
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
  public async expectApiCalls(expected?: Record<string, string>) {
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

    expect.soft(this._apiCalls).toEqual(expected ?? harCalls);
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
  }

  /** Метод используется для возможности ваимодействия со страницей в режиме отладки, чтобы работали моки АПИ */
  public async waitDebug() {
    await wait(this.page, 999999);
  }
}
