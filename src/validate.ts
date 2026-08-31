/**
 * シートの中身が列の定義と合っているかを検査する。
 *
 * シートは人が直接編集する。貼り付け・手入力・IME の誤変換で列の型と合わない値が
 * 入っても、`readRows()` は素通しするため誰も気づかない。数値列に文字列が入れば
 * 集計がずれ、日付列に文字列が入れば凍結日の比較が効かなくなる。
 *
 * 検査の基準は `schema.ts` の `type` と `validation` をそのまま使う (DRY)。
 * 列を足したときに検査側を直し忘れる余地を残さない。
 */

/** 報告する問題の上限。全部並べても読めないので頭だけ出す。 */
const VALIDATE_MAX_PROBLEMS = 30;

interface SheetProblem {
  /** `senders!C12` の形。 */
  cell: string;
  header: string;
  detail: string;
}

function validateSheets(startedAt?: number): SheetProblem[] {
  const budget = budgetStart(startedAt);
  const problems: SheetProblem[] = [];

  // シートを直してから再実行したときに古い索引を使わないよう、実行のたびに捨てる。
  labelPathCache = null;

  for (const spec of SHEET_SPECS) {
    if (outOfTime(budget)) {
      problems.push({ cell: spec.name, header: '', detail: '時間切れでここから先は検査していません' });
      return problems;
    }
    collectSheetProblems(spec, problems);
    collectDanglingLabels(spec, problems);
  }
  return problems;
}

/** labels シートに実在するラベル名。1 回の検査で何度も読み直さないため覚えておく。 */
let labelPathCache: Record<string, boolean> | null = null;

/**
 * ラベルを指す列が、実在しないラベルを指していないか。
 *
 * `labels` は importCurrentState() が Gmail の実態に追随させるので、
 * ここに無い名前は「Gmail に無いラベル」と同義になる。移行でラベル名が変わったのに
 * 古い名前を指したままのルールを有効化すると、getOrCreateLabel() が旧ラベルを
 * 作り直してしまう。適用される前に気づけるようにする。
 *
 * `proposals` は対象外。まだ存在しないラベルを提案するのが役目のため。
 */
function collectDanglingLabels(spec: SheetSpec, problems: SheetProblem[]): void {
  if (spec.name === SHEET_NAMES.LABELS || spec.name === SHEET_NAMES.PROPOSALS) return;

  const targets = spec.columns.filter((column) => column.validation === 'labelPath');
  if (targets.length === 0) return;

  // 索引の作り方は proposals.ts の knownLabelPaths() と同じなのでそれを使う。
  if (!labelPathCache) labelPathCache = knownLabelPaths();

  const sheet = getSheet(spec.name);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const index = resolveColumns(sheet, spec);
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  for (const column of targets) {
    const position = index[column.key];
    for (let offset = 0; offset < values.length; offset += 1) {
      if (problems.length >= VALIDATE_MAX_PROBLEMS) return;

      const value = String(values[offset][position] || '').trim();
      if (value === '' || labelPathCache[value]) continue;

      problems.push({
        cell: `${spec.name}!${columnLetter(position + 1)}${offset + 2}`,
        header: column.header,
        detail: `labels に無いラベルを指しています: "${value}" (有効化すると Gmail 側に作られます)`,
      });
    }
  }
}

function collectSheetProblems(spec: SheetSpec, problems: SheetProblem[]): void {
  const sheet = getSheet(spec.name);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const index = resolveColumns(sheet, spec);
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  for (const column of spec.columns) {
    // 数式列は ARRAYFORMULA がスピルするので、セル単位の型は当てにならない。
    if (column.type === 'formula') continue;

    const allowed = allowedValues(column.validation);
    const position = index[column.key];

    for (let offset = 0; offset < values.length; offset += 1) {
      if (problems.length >= VALIDATE_MAX_PROBLEMS) return;

      const value = values[offset][position];
      if (value === '' || value === null) continue;

      const detail = describeMismatch(column, value, allowed);
      if (detail === '') continue;

      problems.push({
        cell: `${spec.name}!${columnLetter(position + 1)}${offset + 2}`,
        header: column.header,
        detail,
      });
    }
  }
}

/** 選択肢が決まっている列の許容値。labelPath は範囲参照なので対象外。 */
function allowedValues(kind: ValidationKind | undefined): readonly string[] | null {
  const lists: Record<string, readonly string[]> = {
    matchKind: MATCH_KINDS,
    approval: APPROVAL_STATES,
    labelState: LABEL_STATES,
    senderKind: SENDER_KINDS,
    senderState: SENDER_STATES,
  };
  return kind && lists[kind] ? lists[kind] : null;
}

/** 合っていれば空文字。合っていなければ人が直せる説明を返す。 */
function describeMismatch(
  column: ColumnSpec,
  value: unknown,
  allowed: readonly string[] | null
): string {
  const actual = typeName(value);

  if (column.type === 'number' && actual !== 'number') {
    return `数値の列に ${actual} が入っています: ${preview(value)}`;
  }
  if (column.type === 'date' && actual !== 'date') {
    return `日付の列に ${actual} が入っています: ${preview(value)}`;
  }
  if (column.type === 'checkbox' && actual !== 'boolean') {
    return `チェックボックスの列に ${actual} が入っています: ${preview(value)}`;
  }
  if (allowed && allowed.indexOf(String(value).trim()) < 0) {
    return `選択肢にない値です: ${preview(value)} (許容: ${allowed.join(' / ')})`;
  }
  return '';
}

function typeName(value: unknown): string {
  if (value instanceof Date) return 'date';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

/** 値の見た目。長い文字列はログを埋めるので切る。 */
function preview(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : String(value);
  return text.length > 40 ? `"${text.slice(0, 40)}…"` : `"${text}"`;
}

/** ダイジェストのメールに差し込む行。問題が無ければ空配列。 */
function describeProblems(problems: SheetProblem[]): string[] {
  if (problems.length === 0) return [];

  const lines = [`■ シートの型が合っていないセル ${problems.length} 件`];
  for (const problem of problems) {
    lines.push(`  ${problem.cell} ${problem.header} — ${problem.detail}`);
  }
  if (problems.length >= VALIDATE_MAX_PROBLEMS) {
    lines.push(`  (上限 ${VALIDATE_MAX_PROBLEMS} 件まで。直してから再実行すると続きが出ます)`);
  }
  lines.push('');
  return lines;
}

/** メニューから叩く用。その場で結果を見せる。 */
function menuValidateSheets(): void {
  const problems = validateSheets();

  for (const problem of problems) {
    console.warn(`${problem.cell} ${problem.header} — ${problem.detail}`);
  }
  activeBook().toast(
    problems.length === 0
      ? 'シートの型はすべて定義どおりです。'
      : `型が合っていないセルが ${problems.length} 件あります: ${problems[0].cell} ほか。詳細は実行ログ。`,
    'gmail-organizer',
    15
  );
}
