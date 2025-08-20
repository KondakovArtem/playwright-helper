/* eslint-disable import/no-extraneous-dependencies */
import { Locator, Page } from "@playwright/test";

export interface Coord {
  x?: number;
  y?: number;
}

/**
 * Функция эмулирует наведение мыши на центр указанного локатора.
 * При необходимости сдвигает курсор относительно центра локатора на заданный в shift вектор.
 *
 * @param {Locator} locator - Локатор Playwright, на который нужно навести мышь
 * @param {Coord} [shift] - Необязательный сдвиг курсора относительно центра локатора
 */
export async function mouseOver(locator: Locator, shift?: Coord) {
  const page = locator.page();
  const targetBox = await locator.boundingBox();
  if (targetBox) {
    await page.mouse.move(
      targetBox.x + targetBox.width / 2 + (shift?.x ?? 0),
      targetBox.y + targetBox.height / 2 + (shift?.y ?? 0),
      { steps: 5 }
    );
  }
}

/** Функция принудительного изменения темы (для storybook) */
export async function changeTheme(page: Page, theme: string) {
  await page.evaluate(
    ({ theme }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).setTheme(theme);
    },
    { theme }
  );
}
export function delay(count = 200) {
  return new Promise((resolve) => {
    setTimeout(resolve, count);
  });
}

/** Ожидание в мс, + можно задать ожидание загрузки контента */
export async function wait(page: Page, count = 200, waitLoadState = false) {
  if (waitLoadState) {
    await page.waitForLoadState("networkidle", { timeout: 20000 });
  }
  await delay(count);
}

/**
 * Функция эмулирует клик (нажатие и отпускание) левой кнопки мыши на указанный локатор.
 * При необходимости сдвигает курсор относительно локатора на заданный в shift вектор.
 * Не выполняет драг'н'дроп, только клик.
 *
 * @param {Locator} locator - Локатор Playwright, на который нужно кликнуть
 * @param {Coord} [shift] - Необязательный сдвиг курсора относительно локатора
 */
export async function mouseClick(locator: Locator, shift?: Coord) {
  const page = locator.page();
  await mouseDown(locator, shift);
  await page.mouse.up();
}

/**
 * Возвращает координаты и размеры области вокруг локатора с возможностью смещения границ.
 * Используется для получения "клипа" экрана для скриншотов или анализа.
 *
 * @param {Locator} locator - Локатор Playwright, для которого вычисляется область
 * @param {Object} [options] - Опции смещения границ области
 * @param {number} [options.left] - Смещение левой границы влево (px)
 * @param {number} [options.right] - Смещение правой границы вправо (px)
 * @param {number} [options.top] - Смещение верхней границы вверх (px)
 * @param {number} [options.bottom] - Смещение нижней границы вниз (px)
 * @returns {Promise<{x: number, y: number, width: number, height: number}>} - Объект с координатами и размерами области
 */
export async function getScreenClip(
  locator: Locator,
  {
    left,
    right,
    top,
    bottom,
  }: { top?: number; left?: number; right?: number; bottom?: number } = {}
) {
  const box = { ...(await locator.boundingBox()) } as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  if (left) {
    box.x -= left;
    box.width += left;
  }
  if (right) {
    box.width += right;
  }
  if (top) {
    box.y -= top;
    box.height += top;
  }
  if (bottom) {
    box.height += bottom;
  }

  return box;
}

/**
 * Функция эмулирует нажатие (press) левой кнопки мыши на указанный локатор.
 * При необходимости сдвигает курсор относительно локатора на заданный в shift вектор.
 * Не выполняет драг'н'дроп, только нажатие кнопки.
 *
 * @param {Locator} locator - Локатор Playwright, на который нужно нажать
 * @param {Coord} [shift] - Необязательный сдвиг курсора относительно локатора
 */
export async function mouseDown(locator: Locator, shift?: Coord) {
  const page = locator.page();
  await mouseOver(locator, shift);
  await page.mouse.down();
}
/** Функция окончания нажатия на клавишк мышки */
export async function mouseUp(page: Page) {
  await page.mouse.up();
}

/** Убираем мышку с экрана */
export async function removeMouse(page: Page) {
  await page.mouse.up();
  await page.mouse.move(0, 0, { steps: 5 });
  await wait(page);
}

/** Убираем фокус с текущего элемента */
export async function removeFocus(page: Page) {
  await page.evaluate(() => {
    const activeElement = document.activeElement as HTMLElement;
    if (activeElement) activeElement.blur();
  });
  await wait(page);
}

/** Эмулируем нажатие клавиши Tab для перемещения фокуса */
export async function focusWithTab(page: Page, shiftKey = false) {
  await page.keyboard.press(shiftKey ? "Shift+Tab" : "Tab");
  await wait(page);
}

export const DEMO_HOST = `http://${process.env.DEMO_HOST ?? "localhost"}`;
export const DEMO_PORT = process.env.DEMO_PORT ?? "3000";

export async function pressSequence(page: Page, ...presses: string[]) {
  for (const press of presses) {
    await page.keyboard.press(press);
    await wait(page);
  }
}
