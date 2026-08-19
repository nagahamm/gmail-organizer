/**
 * ルールの評価。
 *
 * 照合そのものは Gmail の検索に任せる。1 通ずつヘッダを読むとクォータを食うので、
 * ルールから検索式を組み立てて Gmail 側で絞り込ませる。
 * とくに List-Id は `list:` 演算子で確実に引けるため、
 * Gmail が解釈しない from: のワイルドカードより桁違いに安定する。
 *
 * このファイルは GAS の API に依存しない純粋関数だけを置く。
 * runMatcherSelfTest() で GAS 上から検証できる。
 */

interface Rule {
  rowNumber: number;
  ruleId: string;
  enabled: boolean;
  priority: number;
  kind: MatchKind;
  pattern: string;
  label: string;
  location: string;
  skipInbox: boolean;
  markRead: boolean;
  star: boolean;
  neverSpam: boolean;
  frozenAt: Date | null;
  matchCount: number;
}

/** 検索式に入れる値を安全にする。二重引用符と改行を落とすだけ。 */
function sanitizeQueryValue(value: string): string {
  return String(value || '').replace(/["\n\r]/g, ' ').trim();
}

/** ルール単体の照合条件を Gmail の検索式にする。 */
function buildMatchQuery(kind: MatchKind, pattern: string): string {
  const value = sanitizeQueryValue(pattern);
  if (value === '') return '';

  switch (kind) {
    case 'list_id':
      return `list:(${value})`;
    case 'from':
    case 'from_domain':
      return `from:(${value})`;
    case 'subject':
      return `subject:(${value})`;
    case 'query':
      return value;
    default:
      return '';
  }
}

/**
 * 実際に投げる検索式。
 * 期間で絞り、既に目的のラベルが付いているものは除く (再処理を避けるため)。
 */
function buildRuleQuery(rule: Rule, windowQuery: string): string {
  const match = buildMatchQuery(rule.kind, rule.pattern);
  if (match === '') return '';

  const parts = [match];
  if (windowQuery) parts.push(windowQuery);
  if (rule.label) parts.push(`-label:"${sanitizeQueryValue(rule.label)}"`);
  return parts.join(' ');
}

/**
 * このルールを今回の実行で使ってよいか。
 *
 * `有効 = FALSE` は完全な停止。`凍結日` は「過去メールへの遡及は許すが
 * 新規メールには適用しない」。@AU を増やさずに既存 4,920 通へ付けるのがこれ。
 */
function isRuleApplicable(rule: Rule, now: Date, retroactive: boolean): boolean {
  if (!rule.enabled) return false;
  if (rule.pattern.trim() === '') return false;
  if (!rule.label && !rule.location) return false;
  if (rule.frozenAt && !retroactive && now.getTime() >= rule.frozenAt.getTime()) return false;
  return true;
}

/** rules シートの行を Rule に読み替える。優先度の小さい順に並べる。 */
function loadRules(): Rule[] {
  const rules: Rule[] = [];

  for (const row of readRows(SHEET_NAMES.RULES)) {
    const kind = String(row['kind'] || '').trim() as MatchKind;
    if (MATCH_KINDS.indexOf(kind) < 0) continue;

    rules.push({
      rowNumber: Number(row['_rowNumber']),
      ruleId: String(row['ruleId'] || ''),
      enabled: row['enabled'] === true,
      priority: Number(row['priority']) || 9999,
      kind: kind,
      pattern: String(row['pattern'] || ''),
      label: String(row['label'] || '').trim(),
      location: String(row['location'] || '').trim(),
      skipInbox: row['skipInbox'] === true,
      markRead: row['markRead'] === true,
      star: row['star'] === true,
      neverSpam: row['neverSpam'] === true,
      frozenAt: row['frozenAt'] instanceof Date ? (row['frozenAt'] as Date) : null,
      matchCount: Number(row['matchCount']) || 0,
    });
  }

  return rules.sort((a, b) => a.priority - b.priority);
}

/**
 * 照合ロジックの自己テスト。GAS のエディタから実行して結果をログで見る。
 * 外部の実行環境を用意せずに壊れていないことを確認するため。
 */
function runMatcherSelfTest(): void {
  const failures: string[] = [];

  const check = (name: string, actual: unknown, expected: unknown): void => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`${name}\n  期待: ${JSON.stringify(expected)}\n  実際: ${JSON.stringify(actual)}`);
    }
  };

  check('list_id は list: 演算子になる', buildMatchQuery('list_id', 'news.example.com'), 'list:(news.example.com)');
  check('from は from: になる', buildMatchQuery('from', 'a@example.com'), 'from:(a@example.com)');
  check('subject は subject: になる', buildMatchQuery('subject', '認証コード'), 'subject:(認証コード)');
  check('query は素通し', buildMatchQuery('query', 'has:attachment older_than:1y'), 'has:attachment older_than:1y');
  check('空パターンは式を作らない', buildMatchQuery('from', '   '), '');
  check('二重引用符は落とす', buildMatchQuery('subject', 'a"b'), 'subject:(a b)');

  const base: Rule = {
    rowNumber: 2, ruleId: 'R1', enabled: true, priority: 1, kind: 'list_id',
    pattern: 'news.example.com', label: 'Promo/Store', location: '', skipInbox: true,
    markRead: true, star: false, neverSpam: true, frozenAt: null, matchCount: 0,
  };

  check(
    '検索式は期間と除外ラベルを含む',
    buildRuleQuery(base, 'newer_than:2d'),
    'list:(news.example.com) newer_than:2d -label:"Promo/Store"'
  );

  const now = new Date('2026-08-19T00:00:00Z');
  check('有効なルールは適用する', isRuleApplicable(base, now, false), true);
  check('無効なルールは適用しない', isRuleApplicable({ ...base, enabled: false }, now, false), false);
  check('パターンが空なら適用しない', isRuleApplicable({ ...base, pattern: '  ' }, now, false), false);
  check('付与先が無ければ適用しない', isRuleApplicable({ ...base, label: '', location: '' }, now, false), false);

  const frozen = { ...base, frozenAt: new Date('2026-08-01T00:00:00Z') };
  check('凍結後は新規メールに適用しない', isRuleApplicable(frozen, now, false), false);
  check('凍結後でも遡及には適用する', isRuleApplicable(frozen, now, true), true);

  const future = { ...base, frozenAt: new Date('2026-12-01T00:00:00Z') };
  check('凍結日前なら新規メールにも適用する', isRuleApplicable(future, now, false), true);

  if (failures.length === 0) {
    console.log('runMatcherSelfTest: 全て通過');
    return;
  }
  console.error(`runMatcherSelfTest: ${failures.length} 件失敗\n${failures.join('\n')}`);
  throw new Error(`照合ロジックの自己テストに失敗しました (${failures.length} 件)`);
}
