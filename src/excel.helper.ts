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
  fileName: string,
  simpleEqual = false
) {
  const resultXls = await new Workbook().xlsx.read(
    await download.createReadStream()
  );

  if (!fs.existsSync(fileName)) {
    await download.saveAs(fileName);
  }

  const compareXls = await new Workbook().xlsx.readFile(fileName);

  delete (compareXls as any).created;
  delete (compareXls as any).modified;
  delete (resultXls as any).created;
  delete (resultXls as any).modified;

  const compareModelString = JSON.stringify(compareXls.model);
  const resultModelString = JSON.stringify(resultXls.model);

  if (simpleEqual) {
    expect(compareModelString === resultModelString).toEqual(true);
  } else {
    const compareModel = JSON.parse(compareModelString);
    const resultModel = JSON.parse(resultModelString);
    expect(resultModel).toEqual(compareModel);
  }
}
