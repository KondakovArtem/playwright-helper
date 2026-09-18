import { Download, expect } from "@playwright/test";
import fs from "node:fs";
import { Readable } from "node:stream";
import * as XLSX from "xlsx-js-style";

const READ_OPTIONS = { cellStyles: true } as XLSX.ParsingOptions;

async function readWorkbookFromStream(
  stream: Readable | null
): Promise<XLSX.WorkBook> {
  if (!stream) {
    throw new Error("Не удалось получить поток скачанного файла");
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return XLSX.read(Buffer.concat(chunks), { ...READ_OPTIONS, type: "buffer" });
}

function stripTimestamps(workbook: XLSX.WorkBook) {
  if (!workbook.Props) {
    return;
  }
  delete workbook.Props.CreatedDate;
  delete workbook.Props.ModifiedDate;
}

/**
 * Сравнивает скачанный XLSX-файл с эталонным файлом на диске.
 * Если эталонный файл отсутствует, сохраняет скачанный файл как эталонный.
 * Игнорирует поля CreatedDate и ModifiedDate при сравнении книг.
 *
 * @param {Download} download - Объект скачивания Playwright
 * @param {string} fileName - Путь к эталонному файлу XLSX
 */
export async function compareDownloadedXlsx(
  download: Download,
  fileName: string,
  simpleEqual = false
) {
  const resultXls = await readWorkbookFromStream(
    await download.createReadStream()
  );

  if (!fs.existsSync(fileName)) {
    await download.saveAs(fileName);
  }

  const compareXls = XLSX.readFile(fileName, READ_OPTIONS);

  stripTimestamps(compareXls);
  stripTimestamps(resultXls);

  const compareModelString = JSON.stringify(compareXls);
  const resultModelString = JSON.stringify(resultXls);

  if (simpleEqual) {
    expect(compareModelString === resultModelString).toEqual(true);
  } else {
    const compareModel = JSON.parse(compareModelString);
    const resultModel = JSON.parse(resultModelString);
    expect(resultModel).toEqual(compareModel);
  }
}
