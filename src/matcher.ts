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
  /** 行き先を変えた行の印。張り替えの実行だけが読む。 */
  relabel: boolean;
  matchCount: number;
}

/**
 * 保護を外した複製を返す。**シートは書き換えない。**
 *
 * `受信トレイ除外` か `既読化` を持つルールは、既に別の種別ラベルが付いた
 * スレッドには適用されない (applyToThread)。行き先を変えた行はこの保護に
 * 引っかかって過去メールへ届かないので、張り替えのときだけ 2 つを落とす。
 *
 * セルを手で `FALSE` にして戻す運用にすると、戻し忘れたときに販促が
 * 受信トレイへ残り続け、しかも気づく手がかりが無い。複製に対して落とせば
 * 戻す手順そのものが要らなくなる (docs/constraints.md 設計上の制約 3)。
 */
function relaxProtection(rule: Rule): Rule {
  const relaxed: Rule = {
    rowNumber: rule.rowNumber,
    ruleId: rule.ruleId,
    enabled: rule.enabled,
    priority: rule.priority,
    kind: rule.kind,
    pattern: rule.pattern,
    label: rule.label,
    location: rule.location,
    skipInbox: false,
    markRead: false,
    star: rule.star,
    neverSpam: rule.neverSpam,
    frozenAt: rule.frozenAt,
    inboxDays: rule.inboxDays,
    relabel: rule.relabel,
    matchCount: rule.matchCount,
  };
  return relaxed;
}

/**
 * 対象期間を人に見せる文字にする。
 *
 * 空欄は「設定し忘れ」ではなく**全期間**の意味なので、そう読めるようにする。
 * ダイアログに空白が出るだけだと、実行前の確認が確認にならない。
 *
 * GAS API に触れないので `npm test` で検証できる。
 */
function describeQueryWindow(windowQuery: string): string {
  const value = String(windowQuery || '').trim();
  return value === '' ? '全期間' : value;
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
 * ルールがこの送信元に一致するかを、Gmail 検索を使わずローカルで判定する。
 *
 * `buildMatchQuery()` は Gmail 検索式を作るだけで、ローカルな一致判定はできない。
 * `senders` と `rules` を突き合わせて「ルールが無い送信元」を計算するには、
 * Gmail を経由しないこちらが要る (`docs/design.md` 2.4)。
 *
 * `subject` / `query` はメッセージ本文が要るためローカル判定できず、一致しない扱いにする。
 */
function ruleMatchesSender(kind: MatchKind, pattern: string, address: string, listId: string): boolean {
  const value = pattern.trim().toLowerCase();
  if (value === '') return false;
  const from = address.trim().toLowerCase();

  switch (kind) {
    case 'from':
      return value.startsWith('@') ? from.endsWith(value.slice(1)) : from === value;
    case 'from_domain': {
      const domain = from.split('@').pop() || '';
      return domain === value || domain.endsWith(`.${value}`);
    }
    case 'list_id':
      return listId.trim().toLowerCase() === value;
    default:
      return false;
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

/** Promotions 配下が保持期間を設定していないときの既定日数 (docs/constraints.md 設計上の制約 8)。 */
const PROMOTIONS_DEFAULT_RETENTION_DAYS = 90;

/** ラベルが `Promotions` 自身か、その配下か。 */
function isPromotionsLabel(label: string): boolean {
  return label === 'Promotions' || label.startsWith('Promotions/');
}

/**
 * 保持期間を過ぎたスレッドを引く検索式。設定が無ければ空文字。
 *
 * 既読にして受信トレイに残したメールが、いつまでも溜まらないようにする。
 * 外すのは受信トレイからだけで、削除はしない。
 *
 * `Promotions` 配下だけは、行に保持期間が無くても既定の 90 日を使う。
 * クーポンやキャンペーンは概ね 3 ヶ月で効力を失うため。行に明示した値があればそちらを優先する。
 */
function buildRetentionQuery(rule: Rule): string {
  if (!rule.enabled) return '';

  const label = sanitizeQueryValue(rule.label);
  if (label === '') return '';

  const explicitDays = Math.floor(rule.inboxDays);
  const days = explicitDays > 0 ? explicitDays : isPromotionsLabel(rule.label) ? PROMOTIONS_DEFAULT_RETENTION_DAYS : 0;
  if (days <= 0) return '';

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
      relabel: row['relabel'] === true,
      matchCount: Number(row['matchCount']) || 0,
    });
  }

  return rules.sort((a, b) => a.priority - b.priority);
}
