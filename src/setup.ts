/**
 * スプレッドシートのスキーマ生成。
 *
 * 何度実行しても既存データを壊さない。足りない列は末尾に追加し、
 * 書式と入力規則は毎回貼り直す。
 */

/** 入力規則を貼る行数の上限。手で足す分の余白を含む。 */
const SETUP_ROWS = 2000;

function setup(): void {
  const book = activeBook();
  for (const spec of SHEET_SPECS) {
    ensureSheet(book, spec);
  }
  seedConfigDefaults();
  book.toast('setup 完了。次に importCurrentState() を実行してください。', 'gmail-organizer', 10);
}

function ensureSheet(book: GoogleAppsScript.Spreadsheet.Spreadsheet, spec: SheetSpec): void {
  let sheet = book.getSheetByName(spec.name);
  if (!sheet) sheet = book.insertSheet(spec.name);

  ensureHeaders(sheet, spec);
  applyFormats(sheet, spec);
  applyValidations(sheet, spec);
  applyFormulas(sheet, spec);
}

/** ヘッダ行を用意する。既存のヘッダは動かさず、足りないものだけ末尾に足す。 */
function ensureHeaders(sheet: GoogleAppsScript.Spreadsheet.Sheet, spec: SheetSpec): void {
  const width = sheet.getLastColumn();
  const existing =
    width === 0 ? [] : sheet.getRange(1, 1, 1, width).getValues()[0].map(String).filter((h) => h !== '');

  const missing = spec.columns.map((c) => c.header).filter((header) => existing.indexOf(header) < 0);
  if (missing.length === 0) return;

  sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
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

  if (!sheet.getFilter()) {
    sheet.getRange(1, 1, SETUP_ROWS + 1, sheet.getLastColumn()).createFilter();
  }
}

function applyValidations(sheet: GoogleAppsScript.Spreadsheet.Sheet, spec: SheetSpec): void {
  const index = resolveColumns(sheet, spec);

  for (const column of spec.columns) {
    const range = sheet.getRange(2, index[column.key] + 1, SETUP_ROWS, 1);

    if (column.type === 'checkbox') {
      range.insertCheckboxes();
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
    labelState: ['active', 'archived'],
    migrationOp: MIGRATION_OPS,
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
