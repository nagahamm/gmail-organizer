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

/** ファイル名がシート名として定義済みか。schema.ts に無い名前は取り込まない。 */
function isKnownSheet(name: string): boolean {
  return SHEET_SPECS.some((spec) => spec.name === name);
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

/** Drive の dev-seed-*.csv を探して取り込み、取り込んだファイルはゴミ箱へ送る。 */
function importDevSeed(): void {
  const files = DriveApp.searchFiles(`title contains '${DEV_SEED_PREFIX}' and trashed = false`);
  let imported = 0;

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    // searchFiles の contains は部分一致なので、前方一致だけに絞る。
    if (name.indexOf(DEV_SEED_PREFIX) !== 0) continue;

    const sheetName = name.slice(DEV_SEED_PREFIX.length).replace(/\.csv$/i, '');
    if (!isKnownSheet(sheetName)) {
      console.warn(`importDevSeed: 未知のシート名です。取り込みません: ${sheetName} (${name})`);
      continue;
    }

    const rows = rowsFromTable(Utilities.parseCsv(file.getBlob().getDataAsString('UTF-8')));
    appendRows(sheetName, rows);
    file.setTrashed(true);
    imported += rows.length;
    console.log(`importDevSeed: ${sheetName} へ ${rows.length} 行取り込み、"${name}" をゴミ箱へ送りました`);
  }

  if (imported === 0) console.log('importDevSeed: 取り込み対象の dev-seed-*.csv が見つかりませんでした');
}

/** メニューからの実行。取り込み前に対象ファイルを確認させる。 */
function menuImportDevSeed(): void {
  const ui = SpreadsheetApp.getUi();
  const files = DriveApp.searchFiles(`title contains '${DEV_SEED_PREFIX}' and trashed = false`);
  const names: string[] = [];
  while (files.hasNext()) names.push(files.next().getName());

  if (names.length === 0) {
    ui.alert('開発用データ投入', 'Drive に dev-seed-*.csv が見つかりません。', ui.ButtonSet.OK);
    return;
  }

  const message =
    `次のファイルを取り込みます。取り込んだ後はゴミ箱へ送ります。\n\n${names.join('\n')}\n\n実行しますか?`;
  if (ui.alert('開発用データ投入', message, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  importDevSeed();
}
