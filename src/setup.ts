/**
 * スプレッドシートのスキーマ生成。
 *
 * 何度実行しても既存データを壊さない。足りない列は末尾に追加し、
 * 書式と入力規則は毎回貼り直す。
 */

/** 入力規則を貼る行数の上限。手で足す分の余白を含む。 */
const SETUP_ROWS = 2000;

function setup(): void {
  ensureSheets();

  // 定期実行の登録を初期化の一本道に組み込む。メニューの独立項目のままだと、
  // 押し忘れてもエラーが出ずに何も起きないので気づけない。
  // DRY_RUN の既定は TRUE なので、ここで登録してもラベルは変更されない。
  installTriggers();

  activeBook().toast(
    'setup 完了。トリガーも登録しました。次に importCurrentState() を実行してください。',
    'gmail-organizer',
    10
  );
}

/**
 * シートを定義に合わせる。トリガーには触らない。
 *
 * `setup()` から切り出してあるのは、自動実行が列不足で落ちたときに
 * ここだけを呼んで追いつかせるため。実行中のトリガーを消して作り直すと
 * 15 分の時計が動いてしまう。
 */
function ensureSheets(): void {
  const book = activeBook();
  for (const spec of SHEET_SPECS) {
    ensureSheet(book, spec);
  }
  seedConfigDefaults();
}

function ensureSheet(book: GoogleAppsScript.Spreadsheet.Spreadsheet, spec: SheetSpec): void {
  let sheet = book.getSheetByName(spec.name);
  if (!sheet) sheet = book.insertSheet(spec.name);

  ensureHeaders(sheet, spec);
  applyFormats(sheet, spec);
  applyValidations(sheet, spec);
  applyFormulas(sheet, spec);
}

/**
 * ヘッダ行を用意する。改名を追随し、足りないものだけ末尾に足す。既存の列は動かさない。
 *
 * ヘッダが書き換わったまま追加すると、`resolveColumns()` が新しく増えた方の列を
 * 参照するようになり、以降の書き込みが黙って別の列へ流れる。エラーは出ない。
 * 仕様の列が欠けていて、かつ仕様に無いヘッダが居座っている場合はその形なので、
 * 追加せずに止めて人に直させる。
 */
function ensureHeaders(sheet: GoogleAppsScript.Spreadsheet.Sheet, spec: SheetSpec): void {
  const width = sheet.getLastColumn();
  // 位置を数えるので空文字を落とさない。落とすと改名対象の列を取り違える。
  const raw = width === 0 ? [] : sheet.getRange(1, 1, 1, width).getValues()[0].map(String);

  renameHeaders(sheet, spec, raw);

  const existing = raw.filter((h) => h !== '');
  const headers = spec.columns.map((c) => c.header);
  const missing = headers.filter((header) => existing.indexOf(header) < 0);
  if (missing.length === 0) return;

  const unknown = existing.filter((header) => headers.indexOf(header) < 0);
  if (unknown.length > 0) {
    throw new Error(
      `シート "${spec.name}" のヘッダが壊れています。仕様に無い列 "${unknown.join('", "')}" があり、` +
        `"${missing.join('", "')}" が見つかりません。` +
        `列名を直してから setup() を実行してください (このまま追加すると書き込み先が別の列へ移ります)。`
    );
  }

  sheet.getRange(1, width + 1, 1, missing.length).setValues([missing]);
}

/**
 * ヘッダの改名を追随する。
 *
 * 列を作り直すと既存データが失われるうえ、追加なのか改名なのかを
 * ensureHeaders() が区別できなくなる。ヘッダのセルだけを書き換えて位置は動かさない。
 * `raw` も書き換えるので、以降の判定は改名後の名前で行われる。
 */
function renameHeaders(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  spec: SheetSpec,
  raw: string[]
): void {
  for (const column of spec.columns) {
    if (!column.renamedFrom) continue;
    // 既に新しい名前になっていれば何もしない。
    if (raw.indexOf(column.header) >= 0) continue;

    const at = raw.indexOf(column.renamedFrom);
    if (at < 0) continue;

    sheet.getRange(1, at + 1).setValue(column.header);
    raw[at] = column.header;
    console.log(`ensureHeaders: ${spec.name} の "${column.renamedFrom}" を "${column.header}" に改名しました`);
  }
}

function applyFormats(sheet: GoogleAppsScript.Spreadsheet.Sheet, spec: SheetSpec): void {
  const index = resolveColumns(sheet, spec);

  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  header.setFontWeight('bold').setBackground('#eef2f7').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);

  for (const column of spec.columns) {
    const position = index[column.key] + 1;
    if (column.width) sheet.setColumnWidth(position, column.width);
    if (column.note) sheet.getRange(1, position).setNote(column.note);

    if (column.type === 'date') {
      sheet.getRange(2, position, SETUP_ROWS, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    } else if (column.type === 'number') {
      sheet.getRange(2, position, SETUP_ROWS, 1).setNumberFormat('#,##0');
    }
  }

  ensureFilter(sheet);
}

/**
 * 絞り込みフィルタを、今の列数・行数に合わせる。
 *
 * 「フィルタが無いときだけ作る」にしていたため、初回に作った範囲のまま固定され、
 * 後から足した列が範囲の外に取り残されていた。`setup()` は何度実行しても
 * 同じ結果になるべきなので、狭いときは作り直す。
 *
 * 作り直すと利用者が設定していた絞り込み条件は消えるが、狭いときだけなので毎回は消えない。
 */
function ensureFilter(sheet: GoogleAppsScript.Spreadsheet.Sheet): void {
  const columns = sheet.getLastColumn();
  const rows = SETUP_ROWS + 1;
  const filter = sheet.getFilter();

  if (filter) {
    const range = filter.getRange();
    if (!filterIsTooNarrow(range.getLastColumn(), range.getLastRow(), columns, rows)) return;
    filter.remove();
  }

  sheet.getRange(1, 1, rows, columns).createFilter();
}

/** 今のフィルタ範囲が、必要な範囲を覆えていないか。 */
function filterIsTooNarrow(
  filterColumns: number,
  filterRows: number,
  wantedColumns: number,
  wantedRows: number
): boolean {
  return filterColumns < wantedColumns || filterRows < wantedRows;
}

function applyValidations(sheet: GoogleAppsScript.Spreadsheet.Sheet, spec: SheetSpec): void {
  const index = resolveColumns(sheet, spec);

  for (const column of spec.columns) {
    const range = sheet.getRange(2, index[column.key] + 1, SETUP_ROWS, 1);

    if (column.type === 'checkbox') {
      // insertCheckboxes() は範囲内の全セルに false を書き込むため使えない。
      // 2000 行が値で埋まり、実データが入力規則を貼った範囲の下へ押し出される。
      range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      continue;
    }
    const rule = buildValidation(column.validation);
    if (rule) range.setDataValidation(rule);
  }

  if (spec.name === SHEET_NAMES.PROPOSALS) applyApprovalHighlight(sheet, index);
}

function buildValidation(kind: ValidationKind | undefined): GoogleAppsScript.Spreadsheet.DataValidation | null {
  if (!kind) return null;

  if (kind === 'labelPath') {
    // labels.full_path を参照する。ラベル未投入でも入力を止めないよう allowInvalid は true。
    const labelsSpec = findSheetSpec(SHEET_NAMES.LABELS);
    const letter = columnLetter(columnPosition(labelsSpec, 'fullPath'));
    const source = getSheet(SHEET_NAMES.LABELS).getRange(`${letter}2:${letter}`);
    return SpreadsheetApp.newDataValidation().requireValueInRange(source, true).setAllowInvalid(true).build();
  }

  const lists: Record<string, readonly string[]> = {
    matchKind: MATCH_KINDS,
    approval: APPROVAL_STATES,
    labelState: LABEL_STATES,
    senderKind: SENDER_KINDS,
    senderState: SENDER_STATES,
  };
  const values = lists[kind];
  if (!values) return null;

  return SpreadsheetApp.newDataValidation()
    .requireValueInList(values.slice(), true)
    .setAllowInvalid(false)
    .build();
}

/** 承認済みの提案を目視で拾えるように色を付ける。 */
function applyApprovalHighlight(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  index: Record<string, number>
): void {
  const letter = columnLetter(index['approval'] + 1);
  const target = sheet.getRange(2, 1, SETUP_ROWS, sheet.getLastColumn());

  const approved = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=$${letter}2="承認"`)
    .setBackground('#e6f4ea')
    .setRanges([target])
    .build();
  const rejected = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=$${letter}2="却下"`)
    .setBackground('#f1f3f4')
    .setFontColor('#80868b')
    .setRanges([target])
    .build();

  sheet.setConditionalFormatRules([approved, rejected]);
}

/** full_path のような自動生成列に ARRAYFORMULA を入れる。既に何か入っていれば触らない。 */
function applyFormulas(sheet: GoogleAppsScript.Spreadsheet.Sheet, spec: SheetSpec): void {
  const index = resolveColumns(sheet, spec);
  for (const column of spec.columns) {
    if (column.type !== 'formula' || !column.formula) continue;
    const cell = sheet.getRange(2, index[column.key] + 1);
    if (cell.getFormula() === '' && cell.getValue() === '') cell.setFormula(column.formula);
  }
}

/** config シートが空のときだけ既定値を入れる。 */
function seedConfigDefaults(): void {
  const sheet = getSheet(SHEET_NAMES.CONFIG);
  if (sheet.getLastRow() >= 2) return;
  sheet.getRange(2, 1, CONFIG_DEFAULTS.length, 3).setValues(CONFIG_DEFAULTS);
}

/** config シートの値を読む。無ければ既定値を返す。 */
function readConfig(key: string, fallback: string): string {
  const rows = readRows(SHEET_NAMES.CONFIG);
  for (const row of rows) {
    if (String(row['key']).trim() === key) return String(row['value']).trim();
  }
  return fallback;
}

/** 破壊的操作を止めるかどうか。config シートがコード側の既定より優先される。 */
function isDryRun(): boolean {
  return readConfig('DRY_RUN', CONFIG.DRY_RUN ? 'TRUE' : 'FALSE').toUpperCase() !== 'FALSE';
}
