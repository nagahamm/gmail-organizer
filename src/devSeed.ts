/**
 * 開発用データ投入。
 *
 * Claude はスプレッドシートのセルを直接書けない (Drive のコネクタの制約、
 * docs/design.md 5.3)。開発中にテストデータを入れたいときのために、
 * Drive に置いた CSV を GAS 側 (DriveApp。Drive のコネクタとは別物で、
 * こちらはセルどころかファイルの中身も自由に読み書きできる) が取り込む
 * 経路を用意する。
 *
 * 本番のトリガーからは呼ばない。人がメニューから明示的に実行する使い捨てツール。
 */

/** 取り込み対象とするファイル名の接頭辞。`dev-seed-<シート名>.csv` の形を探す。 */
const DEV_SEED_PREFIX = 'dev-seed-';

/** 取り込み対象の1ファイル。ファイル名から解決したシート名とセットで扱う。 */
interface DevSeedFile {
  file: GoogleAppsScript.Drive.File;
  sheetName: string;
}

/**
 * CSV を Row の配列にする。
 *
 * ヘッダはスプレッドシート上の日本語ヘッダではなく、schema.ts の `key` で書く前提
 * (`appendRows` は key で列を解決するため)。
 *
 * GAS API に触れないので npm test で検証できる。
 */
function rowsFromTable(table: string[][]): Row[] {
  if (table.length < 2) return [];
  const header = table[0].map((cell) => String(cell || '').trim());

  return table.slice(1).map((cols) => {
    const row: Row = {};
    header.forEach((key, i) => {
      if (key !== '') row[key] = cols[i];
    });
    return row;
  });
}

/**
 * CSV は値をすべて文字列で読むため、`"TRUE"` という文字列のままではチェックボックス
 * 列に書いても実際の真偽値にならない。数値列も同様。schema.ts の列定義 (`type`) を見て、
 * その列に限って本来の型へ直す。
 *
 * GAS API に触れないので npm test で検証できる (`spec` は schema.ts の SheetSpec)。
 */
function coerceRowTypes(row: Row, spec: SheetSpec): Row {
  const coerced: Row = { ...row };
  for (const column of spec.columns) {
    const value = coerced[column.key];
    if (value === undefined || value === null || value === '') continue;

    if (column.type === 'checkbox') {
      coerced[column.key] = String(value).trim().toUpperCase() === 'TRUE';
    } else if (column.type === 'number') {
      coerced[column.key] = Number(value);
    }
  }
  return coerced;
}

/**
 * Drive の dev-seed-*.csv を探す。
 *
 * メニューの確認ダイアログと実際の取り込みが同じファイル集合を見るように、
 * 検索とフィルタをここ 1 箇所にまとめる。
 */
function findDevSeedFiles(): DevSeedFile[] {
  const files = DriveApp.searchFiles(`title contains '${DEV_SEED_PREFIX}' and trashed = false`);
  const found: DevSeedFile[] = [];

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    // searchFiles の contains は部分一致なので、前方一致だけに絞る。
    if (name.indexOf(DEV_SEED_PREFIX) !== 0) continue;

    const sheetName = name.slice(DEV_SEED_PREFIX.length).replace(/\.csv$/i, '');
    if (!hasSheetSpec(sheetName)) {
      console.warn(`findDevSeedFiles: 未知のシート名です。取り込みません: ${sheetName} (${name})`);
      continue;
    }
    found.push({ file, sheetName });
  }
  return found;
}

/**
 * Drive の dev-seed-*.csv を取り込み、取り込んだファイルはゴミ箱へ送る。
 *
 * 1 ファイルずつ「読む → 書く → ゴミ箱へ」を完結させる。複数ファイルの結果を
 * ため込んでからまとめて書くと、途中のファイルで失敗したときに前段のファイルが
 * ゴミ箱へ送られないまま残り、再実行で二重に取り込まれる。
 */
function importDevSeed(targets?: DevSeedFile[]): void {
  const list = targets || findDevSeedFiles();
  if (list.length === 0) {
    console.log('importDevSeed: 取り込み対象の dev-seed-*.csv が見つかりませんでした');
    return;
  }

  for (const { file, sheetName } of list) {
    const spec = findSheetSpec(sheetName);
    const rows = rowsFromTable(Utilities.parseCsv(file.getBlob().getDataAsString('UTF-8'))).map((row) =>
      coerceRowTypes(row, spec)
    );
    appendRows(sheetName, rows);
    file.setTrashed(true);
    console.log(`importDevSeed: ${sheetName} へ ${rows.length} 行取り込み、"${file.getName()}" をゴミ箱へ送りました`);
  }
}

/** メニューからの実行。取り込み前に対象ファイルを確認させる。検索は 1 回だけ行い、そのまま取り込みに渡す。 */
function menuImportDevSeed(): void {
  const ui = SpreadsheetApp.getUi();
  const targets = findDevSeedFiles();

  if (targets.length === 0) {
    ui.alert('開発用データ投入', 'Drive に dev-seed-*.csv が見つかりません。', ui.ButtonSet.OK);
    return;
  }

  const names = targets.map((t) => t.file.getName());
  const message =
    `次のファイルを取り込みます。取り込んだ後はゴミ箱へ送ります。\n\n${names.join('\n')}\n\n実行しますか?`;
  if (ui.alert('開発用データ投入', message, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  importDevSeed(targets);
}

/** 取り込み対象とするファイル名の接頭辞。`dev-update-<シート名>.csv` の形を探す。新規行の追記ではなく、既存行の空セルだけ埋める。 */
const DEV_UPDATE_PREFIX = 'dev-update-';

/**
 * Drive の dev-update-*.csv を探す。findDevSeedFiles() と同じ理由で 1 箇所にまとめる。
 */
function findDevUpdateFiles(): DevSeedFile[] {
  const files = DriveApp.searchFiles(`title contains '${DEV_UPDATE_PREFIX}' and trashed = false`);
  const found: DevSeedFile[] = [];

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    if (name.indexOf(DEV_UPDATE_PREFIX) !== 0) continue;

    const sheetName = name.slice(DEV_UPDATE_PREFIX.length).replace(/\.csv$/i, '');
    if (!hasSheetSpec(sheetName)) {
      console.warn(`findDevUpdateFiles: 未知のシート名です。取り込みません: ${sheetName} (${name})`);
      continue;
    }
    found.push({ file, sheetName });
  }
  return found;
}

/**
 * CSV の 1 列目をキーにして、既存行のうち空セルだけを埋める更新指示を作る。
 *
 * 既に値が入っているセルには触れない。「人と週次AIが育てる列」(senders.運営元など) を
 * 一括投入で上書きしてしまわないための安全策。
 *
 * GAS API に触れないので npm test で検証できる。
 */
function buildDevUpdates(table: string[][], existingRows: Row[], keyColumn: string): CellUpdate[] {
  if (table.length < 2) return [];
  const header = table[0].map((cell) => String(cell || '').trim());
  const keyIndex = header.indexOf(keyColumn);
  if (keyIndex < 0) return [];

  const rowByKey: Record<string, Row> = {};
  for (const row of existingRows) {
    const key = String(row[keyColumn] || '').trim();
    if (key !== '') rowByKey[key] = row;
  }

  const updates: CellUpdate[] = [];
  for (const cols of table.slice(1)) {
    const key = String(cols[keyIndex] || '').trim();
    const existing = rowByKey[key];
    if (!existing) continue;

    header.forEach((column, i) => {
      if (i === keyIndex || column === '') return;
      const current = existing[column];
      if (current !== undefined && current !== null && String(current).trim() !== '') return;
      const value = cols[i];
      if (value === undefined || value === '') return;
      updates.push({ rowNumber: Number(existing['_rowNumber']), key: column, value });
    });
  }
  return updates;
}

/** Drive の dev-update-*.csv を取り込み、既存行の空セルだけ埋める。取り込んだファイルはゴミ箱へ送る。 */
function importDevUpdate(targets?: DevSeedFile[]): void {
  const list = targets || findDevUpdateFiles();
  if (list.length === 0) {
    console.log('importDevUpdate: 取り込み対象の dev-update-*.csv が見つかりませんでした');
    return;
  }

  for (const { file, sheetName } of list) {
    const table = Utilities.parseCsv(file.getBlob().getDataAsString('UTF-8'));
    if (table.length === 0) continue;
    const existingRows = readRows(sheetName);
    const updates = buildDevUpdates(table, existingRows, table[0][0]);
    updateCells(sheetName, updates);
    file.setTrashed(true);
    console.log(
      `importDevUpdate: ${sheetName} へ ${updates.length} セルを更新し、"${file.getName()}" をゴミ箱へ送りました`
    );
  }
}

/** メニューからの実行。取り込み前に対象ファイルを確認させる。 */
function menuImportDevUpdate(): void {
  const ui = SpreadsheetApp.getUi();
  const targets = findDevUpdateFiles();

  if (targets.length === 0) {
    ui.alert('開発用データ更新', 'Drive に dev-update-*.csv が見つかりません。', ui.ButtonSet.OK);
    return;
  }

  const names = targets.map((t) => t.file.getName());
  const message =
    `次のファイルで、既存行の空セルだけ埋めます。取り込んだ後はゴミ箱へ送ります。\n\n${names.join('\n')}\n\n実行しますか?`;
  if (ui.alert('開発用データ更新', message, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  importDevUpdate(targets);
}
