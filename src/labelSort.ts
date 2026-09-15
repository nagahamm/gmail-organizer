/**
 * labels シートの並び順を整える。
 *
 * 行の追加順 (Gmail からの取り込み順・提案の承認順) がそのまま並び順になるため、
 * 増えるほど大項目・中項目が入り乱れて見渡せなくなる。大項目→中項目→小項目の
 * ABC 順に並べ替えて一覧性を保つ。
 */

/** 1 フィールド分の比較。単純な文字列比較で足りる (日英混在は移行済みで解消済み)。 */
function compareLabelField(a: unknown, b: unknown): number {
  const left = String(a || '');
  const right = String(b || '');
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * labels の 2 行を大項目→中項目→小項目の順で比較する。
 *
 * GAS API に触れないので npm test で検証できる。
 */
function compareLabelRows(a: Row, b: Row): number {
  return (
    compareLabelField(a['major'], b['major']) ||
    compareLabelField(a['middle'], b['middle']) ||
    compareLabelField(a['minor'], b['minor'])
  );
}

/**
 * labels シートを並べ替えて書き直す。
 *
 * `full_path` は数式列なので `replaceRows` が触らない (docs/design.md「テストをどう
 * 回すか」と同じ、appendRows/replaceRows の「数式列には一切触れない」設計)。
 * 行の中身だけ入れ替わり、ARRAYFORMULA は row2 に置いたまま各行を計算し直す。
 */
function sortLabelsSheet(): void {
  const rows = readRows(SHEET_NAMES.LABELS);
  rows.sort(compareLabelRows);
  replaceRows(SHEET_NAMES.LABELS, rows);
  console.log(`sortLabelsSheet: ${rows.length} 行を大項目→中項目→小項目の順に並べ替えました`);
}

/** メニューからの実行。 */
function menuSortLabelsSheet(): void {
  sortLabelsSheet();
  SpreadsheetApp.getUi().alert('labels の並べ替え', '大項目→中項目→小項目のABC順に並べ替えました。', SpreadsheetApp.getUi().ButtonSet.OK);
}
