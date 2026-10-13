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
  /** 販促をゴミ箱へ入れるまでの日数。0 なら捨てない。 */
  deleteDays: number;
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
    deleteDays: rule.deleteDays,
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

/**
 * 付いているラベル名の一覧に、このルールの行き先とは別の種別のラベルがあるか。
 *
 * 種別は**大項目**で決まる (schema.ts: 大項目 = メールの種別)。フルパスで比べると
 * `Promotions/Fashion` と `Promotions/Beauty` が別の種別になり、販促同士で
 * 受信トレイ除外が止まって受信トレイに残り続ける。
 *
 * 拠点ラベル (`@` 始まり) は数えない。1 通に `Promotions/Stores` と `@AU` の
 * 両方が付くのは正しい挙動なので、並行付与を壊さないようにする。
 *
 * 受信トレイから外す / 既読にする判断の手前で必ず通す。ルールの適用も
 * 保持期間の掃除も同じ線引きを使う (docs/requirements.md 受信トレイから外すのは…)。
 */
function carriesOtherTypeLabel(labelNames: string[], rule: Rule): boolean {
  const own = splitLabelPath(rule.label).major;

  return labelNames.some((name) => {
    if (name.charAt(0) === '@') return false;
    if (name === rule.location) return false;
    return splitLabelPath(name).major !== own;
  });
}

/** Promotions 配下が保持期間を設定していないときの既定日数 (docs/constraints.md 設計上の制約 8)。 */
const PROMOTIONS_DEFAULT_RETENTION_DAYS = 90;

/** ラベルが `Promotions` 自身か、その配下か。 */
function isPromotionsLabel(label: string): boolean {
  return label === 'Promotions' || label.startsWith('Promotions/');
}

/**
 * 自動承認してよい提案の種別。
 *
 * ルールを増やすものだけ。`rename_label` / `archive_label` はラベルの木を
 * 作り替えるので、メールを受信トレイへ戻すだけでは復旧しない。
 * `unsubscribe` は人の意思表示なので機械で決めない。
 */
const AUTO_APPROVE_KINDS = ['new_rule', 'inbox_skip'];

/**
 * 行き先が裸の `Promotions` になっているか。
 *
 * `Promotions` 配下はジャンルで分けるのが前提で、裸の大項目に溜めると
 * 中項目を開いても見えない (`label:親` は子を含まない)。しかも
 * 保持期間の既定 90 日と削除の対象に入るので、**ジャンルを一度も決められないまま
 * 消える**。週次の検査で報告して、人が中項目を決められるようにする。
 *
 * `Subscriptions` / `Support` / `Official` は裸の大項目で実際に使っているので
 * 対象にしない。`Promotions` だけが受信トレイ除外・既読化・削除の対象になる。
 */
function isBarePromotionsLabel(label: string): boolean {
  return String(label || '').trim() === 'Promotions';
}

/**
 * そのパターンのルールが既にあるか。
 *
 * 承認の反映は途中で止まりうる (6 分制限)。ルールの追記と `反映日` の記入が
 * 同じ瞬間には終わらないので、**再実行しても安全**でなければならない。
 * 順序を入れ替えても解決しない。`反映日` を先に書けば、ルール追加に失敗した
 * ときに提案が黙って消える。だから「既にあるなら足さない」で冪等にする。
 */
function ruleExistsForPattern(existing: Record<string, boolean>, pattern: string): boolean {
  const key = String(pattern || '').trim();
  return key !== '' && existing[key] === true;
}

/**
 * 人を通さずに承認してよい提案か。
 *
 * 承認そのものが「登録が面倒」の再来になっていたため、**間違えても害が小さい
 * 範囲に限って**人の操作を省く。行き先が `Promotions` 配下なら、外れても
 * 販促がアーカイブされるだけで、受信トレイへ戻せば復旧する。
 *
 * `Work` / `Finance` / `Security` は対象にしない。求人や口座の判断は機械に
 * 向かず、実際に人が却下している提案が多い領域 (docs/requirements.md 承認による学習)。
 *
 * 既存の線引き「除外して既読にしてよいのは Promotions だけ」と同じ境界を使う。
 */
function isAutoApprovable(kind: string, label: string): boolean {
  if (AUTO_APPROVE_KINDS.indexOf(String(kind).trim()) < 0) return false;

  const target = String(label).trim();
  if (target === '') return false;

  // 裸の `Promotions` は除く。proposer.ts は「ジャンルは人が決める」前提で
  // わざと大項目に留めて提案している。ここで通すとその前提が破れ、
  // ジャンルが決まらないまま保持期間と削除の対象になる (Issue #106)。
  if (isBarePromotionsLabel(target)) return false;

  return isPromotionsLabel(target);
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
 * `削除日数` の下限。これより短い設定は下限まで引き上げる。
 *
 * `1` と打ち間違えたときに直近の販促がまとめて消えるのを防ぐ
 * (docs/constraints.md 設計上の制約 10)。
 */
const DELETE_MIN_AGE_DAYS = 180;

/**
 * 「気になった跡」として検索式で除ける印。
 *
 * スターは人が自分で付けたもの。`is:important` は Gmail の重要マーク。
 * 添付があるものは、販促の体裁でもバウチャーやチケットの実体を持つことがある。
 *
 * 実データでの広さを確認済み (`Promotions/Fashion` 4,421 通のうち
 * 重要マーク 21 通 / 添付 1 通)。消したいものをほとんど削らずに、
 * 残したい稀な例だけを拾える。
 */
const DELETE_KEEP_FLAGS = '-is:starred -is:important -has:attachment';

/**
 * ゴミ箱へ入れる対象を引く検索式。対象外なら空文字。
 *
 * **`Promotions` 配下のラベルだけ。** 他の大項目に `削除日数` を書いても無視する。
 * 消えて困るものが設定ミスで入る余地を作らないため、列の値ではなくラベルで弾く。
 *
 * 日数は行の `削除日数` が優先で、無ければ `defaultDays` (config の
 * `PROMOTIONS_DELETE_DAYS`) を使う。どちらも無ければ何も消さない。
 *
 * 完全削除はしないので、ここで引いたものはゴミ箱に 30 日残る。
 */
function buildDeleteQuery(rule: Rule, defaultDays: number = 0): string {
  if (!rule.enabled) return '';

  const label = sanitizeQueryValue(rule.label);
  if (label === '') return '';

  // 境界は受信トレイ除外と自動承認に揃える。
  if (!isPromotionsLabel(rule.label)) return '';

  const requested = positiveDays(rule.deleteDays) || positiveDays(defaultDays);
  if (requested <= 0) return '';

  const days = Math.max(requested, DELETE_MIN_AGE_DAYS);
  return `label:"${label}" older_than:${days}d ${DELETE_KEEP_FLAGS}`;
}

/**
 * 正の整数の日数として読めれば返す。読めなければ 0。
 *
 * NaN を素通りさせると older_than:NaNd という検索式を組んでしまう。
 */
function positiveDays(value: unknown): number {
  const days = Math.floor(Number(value));
  return Number.isFinite(days) && days > 0 ? days : 0;
}

/**
 * スレッドに自分の送信が含まれるか。含まれれば「気になったもの」として残す。
 *
 * これは Gmail の検索式では表現できない。検索条件はメッセージ単位で
 * 評価されるため `from:me AND label:Promotions` では意図した絞り込みにならない
 * (docs/constraints.md Gmail 側の制約 3)。だからスレッドごとにコードで見る。
 *
 * 返信したということは、その販促に反応したということ。消さない。
 */
function hasOwnReply(senders: string[], me: string): boolean {
  const own = String(me || '').trim().toLowerCase();
  if (own === '') return false;

  return senders.some((from) => extractAddress(from) === own);
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
      deleteDays: Number(row['deleteDays']) || 0,
      relabel: row['relabel'] === true,
      matchCount: Number(row['matchCount']) || 0,
    });
  }

  return rules.sort((a, b) => a.priority - b.priority);
}
