/**
 * ルールの評価。
 *
 * 照合そのものは Gmail の検索に任せる。1 通ずつヘッダを読むとクォータを食うので、
 * ルールから検索式を組み立てて Gmail 側で絞り込ませる。
 * とくに List-Id は `list:` 演算子で確実に引けるため、
 * Gmail が解釈しない from: のワイルドカードより桁違いに安定する。
 *
 * このファイルは GAS の API に依存しない純粋関数だけを置く。
 * 純粋関数なので `npm test` で Node から直接検証できる。
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
  /** 既読にして受信トレイに残したメールを外すまでの日数。0 なら外さない。 */
  inboxDays: number;
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
 * 保持期間を過ぎたスレッドを引く検索式。設定が無ければ空文字。
 *
 * 既読にして受信トレイに残したメールが、いつまでも溜まらないようにする。
 * 外すのは受信トレイからだけで、削除はしない。
 */
function buildRetentionQuery(rule: Rule): string {
  if (!rule.enabled) return '';
  const days = Math.floor(rule.inboxDays);
  if (days <= 0) return '';

  const label = sanitizeQueryValue(rule.label);
  if (label === '') return '';

  return `label:"${label}" in:inbox older_than:${days}d`;
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
      inboxDays: Number(row['inboxDays']) || 0,
      matchCount: Number(row['matchCount']) || 0,
    });
  }

  return rules.sort((a, b) => a.priority - b.priority);
}
