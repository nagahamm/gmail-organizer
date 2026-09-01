/**
 * シートの読み書きユーティリティ。
 *
 * 列の位置はハードコードせず、1 行目のヘッダ文字列から解決する。
 * 人が列を並べ替えてもコードが壊れないようにするため。
 */

type Row = Record<string, unknown>;

function activeBook(): GoogleAppsScript.Spreadsheet.Spreadsheet {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) {
    throw new Error('スプレッドシートが見つかりません。コンテナバインド型として実行してください。');
  }
  return book;
}

function getSheet(name: string): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = activeBook().getSheetByName(name);
  if (!sheet) throw new Error(`シート "${name}" がありません。setup() を実行してください。`);
  return sheet;
}

/**
 * 列不足のエラーに入れる目印。
 * コードが要求する列にシートが追いついていないだけの状態を、他の失敗と区別する。
 */
const MISSING_COLUMN_MARK = 'に列がありません';

/** そのエラーが「列がまだ無い」だけのものか。 */
function isMissingColumnError(message: string): boolean {
  return message.indexOf(MISSING_COLUMN_MARK) >= 0;
}

/** 1 行目のヘッダから「spec の key → 0 始まりの列番号」を作る。 */
function resolveColumns(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  spec: SheetSpec
): Record<string, number> {
  const width = sheet.getLastColumn();
  if (width === 0) throw new Error(`シート "${spec.name}" が空です。setup() を実行してください。`);

  const headers = sheet.getRange(1, 1, 1, width).getValues()[0].map(String);
  const index: Record<string, number> = {};
  const missing: string[] = [];

  for (const column of spec.columns) {
    const at = headers.indexOf(column.header);
    if (at < 0) missing.push(column.header);
    else index[column.key] = at;
  }
  if (missing.length > 0) {
    throw new Error(
      `シート "${spec.name}"${MISSING_COLUMN_MARK}: ${missing.join(', ')}。setup() を実行してください。`
    );
  }
  return index;
}

/** データ行を key 付きのオブジェクトとして読む。全て空の行は捨てる。 */
function readRows(sheetName: string): Row[] {
  const spec = findSheetSpec(sheetName);
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const index = resolveColumns(sheet, spec);
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  const rows: Row[] = [];
  values.forEach((line, offset) => {
    if (line.every((cell) => cell === '' || cell === null)) return;
    const row: Row = { _rowNumber: offset + 2 };
    for (const column of spec.columns) row[column.key] = line[index[column.key]];
    rows.push(row);
  });
  return rows;
}

/**
 * 数式列を除いた、連続する列のかたまり。
 *
 * 行の全幅を setValues() で書くと数式セルを空文字で潰してしまう。
 * ARRAYFORMULA は 1 つ上のセルから下へスピルするので、
 * 空文字を 1 つ書き込むだけで列全体が死ぬ。かたまりごとに書いて避ける。
 */
interface ColumnBlock {
  /** 1 始まりの開始列。 */
  start: number;
  /** 列数。 */
  size: number;
}

function blocksExcluding(
  spec: SheetSpec,
  index: Record<string, number>,
  width: number,
  excludeTypes: ColumnType[]
): ColumnBlock[] {
  const skip: Record<number, boolean> = {};
  for (const column of spec.columns) {
    if (column.type && excludeTypes.indexOf(column.type) >= 0) skip[index[column.key]] = true;
  }

  const blocks: ColumnBlock[] = [];
  let start = -1;

  for (let at = 0; at <= width; at += 1) {
    const blocked = at === width || skip[at];
    if (!blocked && start < 0) start = at;
    if (blocked && start >= 0) {
      blocks.push({ start: start + 1, size: at - start });
      start = -1;
    }
  }
  return blocks;
}

function writableBlocks(spec: SheetSpec, index: Record<string, number>, width: number): ColumnBlock[] {
  return blocksExcluding(spec, index, width, ['formula']);
}

/**
 * 実データの検出に使える、信頼できる列のかたまり。formula 列に加え checkbox 列も除く。
 *
 * `requireCheckbox()` を貼った未入力セルは、Sheets 内部では空文字ではなく
 * 真偽値 `FALSE` を持つセルとして扱われる。`setup()` は `SETUP_ROWS` 分の
 * チェックボック列にあらかじめ検証を貼るため、これを実データとして数えると
 * 最終行が常に `SETUP_ROWS` 分膨らんでしまう。
 */
function anchorBlocks(spec: SheetSpec, index: Record<string, number>, width: number): ColumnBlock[] {
  return blocksExcluding(spec, index, width, ['formula', 'checkbox']);
}

/**
 * 実データの最終行を返す。ヘッダ行しか無ければ 1。
 *
 * `getLastRow()` は使えない。ARRAYFORMULA は空文字をシート末尾まで出力し、
 * checkbox 列は未入力でも `FALSE` を持つ。どちらも content として数えられてしまうため、
 * それらを除いたかたまりだけを見て数える。
 */
function lastDataRow(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  blocks: ColumnBlock[],
  searchUpTo: number
): number {
  if (searchUpTo < 2) return 1;

  let last = 1;
  for (const block of blocks) {
    const values = sheet.getRange(2, block.start, searchUpTo - 1, block.size).getValues();
    for (let at = values.length - 1; at >= 0; at -= 1) {
      if (at + 2 <= last) break;
      if (values[at].every((cell) => cell === '' || cell === null)) continue;
      last = at + 2;
      break;
    }
  }
  return last;
}

/** 追記を始める行番号。 */
function appendTopRow(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  spec: SheetSpec,
  index: Record<string, number>,
  width: number
): number {
  const searchUpTo = sheet.getLastRow();
  return lastDataRow(sheet, anchorBlocks(spec, index, width), searchUpTo) + 1;
}

/** オブジェクトの配列を末尾に追記する。数式列には一切触れない。 */
function appendRows(sheetName: string, rows: Row[]): void {
  if (rows.length === 0) return;
  const spec = findSheetSpec(sheetName);
  const sheet = getSheet(sheetName);
  const index = resolveColumns(sheet, spec);
  const width = sheet.getLastColumn();

  const values = rows.map((row) => {
    const line: unknown[] = new Array(width).fill('');
    for (const column of spec.columns) {
      if (column.type === 'formula') continue;
      const value = row[column.key];
      line[index[column.key]] = value === undefined || value === null ? '' : value;
    }
    return line;
  });

  const blocks = writableBlocks(spec, index, width);
  const top = appendTopRow(sheet, spec, index, width);

  for (const block of blocks) {
    const slice = values.map((line) => line.slice(block.start - 1, block.start - 1 + block.size));
    sheet.getRange(top, block.start, slice.length, block.size).setValues(slice);
  }
}

/** データ行を全て消してから書き直す。数式列は消さない。 */
function replaceRows(sheetName: string, rows: Row[]): void {
  const spec = findSheetSpec(sheetName);
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const index = resolveColumns(sheet, spec);
    for (const block of writableBlocks(spec, index, sheet.getLastColumn())) {
      sheet.getRange(2, block.start, lastRow - 1, block.size).clearContent();
    }
  }
  appendRows(sheetName, rows);
}

/** 1 セルの更新指示。 */
interface CellUpdate {
  /** 1 始まりの行番号。`readRows()` が返す `_rowNumber` をそのまま渡す。 */
  rowNumber: number;
  /** spec 上の列 key。 */
  key: string;
  value: unknown;
}

/**
 * 複数セルをまとめて更新する。
 *
 * 1 セルずつ書くとヘッダ行の読み直しが毎回入り、100 行の更新で 1,000 回以上の
 * API コールになる。GAS は 1 実行 6 分で止まるので、行数に比例して呼ぶ形は使えない。
 * ヘッダ解決は 1 回だけ行い、行ごとに連続する列を 1 回の `setValues()` で書く。
 */
function updateCells(sheetName: string, updates: CellUpdate[]): void {
  if (updates.length === 0) return;

  const spec = findSheetSpec(sheetName);
  const sheet = getSheet(sheetName);
  const index = resolveColumns(sheet, spec);

  const formula: Record<string, boolean> = {};
  for (const column of spec.columns) {
    if (column.type === 'formula') formula[column.key] = true;
  }

  // 行番号 → (0 始まりの列番号 → 値)。
  const byRow: Record<number, Record<number, unknown>> = {};
  for (const update of updates) {
    if (!(update.key in index)) {
      throw new Error(`シート "${sheetName}" に列 "${update.key}" がありません。`);
    }
    if (formula[update.key]) {
      throw new Error(`シート "${sheetName}" の列 "${update.key}" は数式列です。書き換えると列全体が壊れます。`);
    }
    if (!byRow[update.rowNumber]) byRow[update.rowNumber] = {};
    byRow[update.rowNumber][index[update.key]] = update.value;
  }

  for (const key of Object.keys(byRow)) {
    const rowNumber = Number(key);
    const cells = byRow[rowNumber];
    const columns = Object.keys(cells)
      .map(Number)
      .sort((left, right) => left - right);

    let at = 0;
    while (at < columns.length) {
      let end = at;
      while (end + 1 < columns.length && columns[end + 1] === columns[end] + 1) end += 1;

      const line = columns.slice(at, end + 1).map((column) => cells[column]);
      sheet.getRange(rowNumber, columns[at] + 1, 1, line.length).setValues([line]);
      at = end + 1;
    }
  }
}

/** 1 セルだけ更新する。まとめて更新できるなら `updateCells()` を使う。 */
function updateCell(sheetName: string, rowNumber: number, key: string, value: unknown): void {
  updateCells(sheetName, [{ rowNumber, key, value }]);
}

/** 1 始まりの列番号を A1 記法の列文字に変換する。 */
function columnLetter(position: number): string {
  let rest = position;
  let letter = '';
  while (rest > 0) {
    const remainder = (rest - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    rest = Math.floor((rest - remainder) / 26);
  }
  return letter;
}

/** spec 上の列位置 (1 始まり) を返す。データ検証の参照範囲を組むのに使う。 */
function columnPosition(spec: SheetSpec, key: string): number {
  const at = spec.columns.findIndex((column) => column.key === key);
  if (at < 0) throw new Error(`シート "${spec.name}" の定義に "${key}" がありません。`);
  return at + 1;
}
