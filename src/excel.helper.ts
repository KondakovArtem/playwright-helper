import { Download, expect } from "@playwright/test";
import { Workbook } from "exceljs";
import fs from "fs";

/**
 * Сравнивает скачанный XLSX-файл с эталонным файлом на диске.
 * Если эталонный файл отсутствует, сохраняет скачанный файл как эталонный.
 * Игнорирует поля created и modified при сравнении моделей файлов.
 *
 * @param {Download} download - Объект скачивания Playwright
 * @param {string} fileName - Путь к эталонному файлу XLSX
 */
export async function compareDownloadedXlsx(
  download: Download,
  fileName: string
) {
  const resultXls = await new Workbook().xlsx.read(
    await download.createReadStream()
  );

  if (!fs.existsSync(fileName)) {
    await download.saveAs(fileName);
  }

  const compareXls = await new Workbook().xlsx.readFile(fileName);
  const compareModel = JSON.parse(JSON.stringify(compareXls.model));
  const resultModel = JSON.parse(JSON.stringify(resultXls.model));

  delete compareModel.created;
  delete compareModel.modified;
  delete resultModel.created;
  delete resultModel.modified;

  expect(resultModel).toEqual(compareModel);
}
