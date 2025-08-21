# @kavoxx/playwright-helper

Библиотека вспомогательных функций для автоматизации тестирования с помощью Playwright.

## Описание

Этот пакет содержит набор утилит и вспомогательных методов для упрощения написания e2e-тестов на базе Playwright. Подходит для ускорения разработки, повышения читаемости и повторного использования кода в тестах.

## Установка

```bash
npm install @kavoxx/playwright-helper
```
или
```bash
yarn add @kavoxx/playwright-helper
```

## Использование

Импортируйте необходимые функции в ваш проект Playwright:

```ts
import { addTestAnnotation, networkRecorderWait } from '@kavoxx/playwright-helper';
```

## Примеры

_Примеры использования будут добавлены позже._

# CHANGELOG

## 1.54.2-alpha.26
- В функцию `makeScreenshotResolutions` добавлен параметр `delay` для управления задержкой между формированием скриншотов.

## 1.54.2-alpha.24
- Добавлены функции `networkRecorderWait` и `isNetworkRecorder` в файл `src/test.helper.ts` для работы с режимом network-recorder и проверки его состояния.
