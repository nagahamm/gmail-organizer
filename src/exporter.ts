/**
 * シートを Drive へ CSV で書き出す。
 *
 * **一方向だけ。** 読み戻して書き込む経路は作らない。同じセルに人・GAS・
 * ローカルの 3 者が書くとマージできない (セルに版を持っていない)。
 * 書き込みたいときは `devMail.ts` の `dev-update` / `dev-overwrite` を使う。
 *
 * ローカルへの同期は Google ドライブのデスクトップアプリに任せる。
 * 自前の同期コードを書かず、認証情報も持たない。GAS を選んだ理由
 * (OAuth クライアントとシークレットの管理が不要) を崩さないため。
 *
 * 週次のスナップショットはバックアップとしても効く。悪い実行で崩れたシートを、
 * 前週の CSV と見比べて確かめられる。
 */

/** 書き出し先のフォルダ名。無ければ作る。 */
const EXPORT_FOLDER_NAME = 'gmail-organizer-export';

/**
 * 書き出さないシートの接頭辞。
 *
 * `log` は 1 万行、`log_1` は 10 万行に達する。CSV にすると毎週 20 MB 近くになり、
 * 読み出し自体も重い。追記専用でロールオーバーの仕組みも既にある。
 */
const EXPORT_SKIP_PREFIX = 'log';

/**
 * 1 セルを CSV の 1 フィールドにする。
 *
 * `=` `+` `-` `@` で始まる値は先頭に `'` を付けて無害化する。件名には `=` から
 * 始まるものがあり、`devSeed.ts` で取り込み直したときに数式として解釈される。
 *
 * GAS API に触れないので npm test で検証できる。
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  const raw = value instanceof Date ? value.toISOString() : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;

  // 引用符・カンマ・改行のどれかを含むなら囲む。引用符は 2 つ重ねる。
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

/** 行の配列を CSV にする。末尾に改行を 1 つ置く。 */
function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

/** 書き出す対象のシート名か。 */
function isExportableSheet(name: string): boolean {
  return !name.startsWith(EXPORT_SKIP_PREFIX);
}

/** 書き出し先のフォルダ。無ければ作る。 */
function exportFolder(): GoogleAppsScript.Drive.Folder {
  const found = DriveApp.getFoldersByName(EXPORT_FOLDER_NAME);
  return found.hasNext() ? found.next() : DriveApp.createFolder(EXPORT_FOLDER_NAME);
}

/**
 * 各シートを CSV にして Drive へ置く。戻り値は書き出したシート数。
 *
 * 同名のファイルは中身を差し替える。毎週ファイルが増えないようにするため。
 * 履歴が要るなら Drive 側の版管理が勝手に持つ。
 */
function exportSheetsToDrive(startedAt?: number): number {
  const since = budgetStart(startedAt);
  const folder = exportFolder();
  let written = 0;

  for (const sheet of activeBook().getSheets()) {
    if (outOfTime(since)) {
      console.warn('exportSheetsToDrive: 時間切れのため残りのシートを飛ばしました');
      break;
    }

    const name = sheet.getName();
    if (!isExportableSheet(name)) continue;

    // getLastRow() を直に使うと、labels は full_path の ARRAYFORMULA が
    // 列末尾までスピルするぶんだけ空行が付いてくる。grep する用途が壊れる。
    const lastRow = dataLastRow(sheet);
    const lastColumn = sheet.getLastColumn();
    if (lastRow === 0 || lastColumn === 0) continue;

    const csv = toCsv(sheet.getRange(1, 1, lastRow, lastColumn).getValues());
    writeExportFile(folder, `${name}.csv`, csv);
    written += 1;
  }

  console.log(`exportSheetsToDrive: ${written} シートを ${EXPORT_FOLDER_NAME} へ書き出しました`);
  return written;
}

/** 同名ファイルがあれば中身を差し替え、無ければ作る。 */
function writeExportFile(
  folder: GoogleAppsScript.Drive.Folder,
  fileName: string,
  content: string
): void {
  const found = folder.getFilesByName(fileName);
  if (found.hasNext()) {
    found.next().setContent(content);
    return;
  }
  folder.createFile(fileName, content, 'text/csv');
}
