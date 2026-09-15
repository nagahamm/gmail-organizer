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
    const rows = rowsFromTable(Utilities.parseCsv(file.getBlob().getDataAsString('UTF-8')));
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
