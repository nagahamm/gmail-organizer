/**
 * 既存のラベルと Gmail フィルタをシートへ取り込む。
 *
 * ラベル 39 個とフィルタを手入力するのは現実的でない。当初の課題
 * 「登録が面倒」を初期コストとして繰り返さないために機械的に吸い出す。
 *
 * 取り込んだルールは全て `有効 = FALSE` で入る。人が確認してから有効化する。
 */

function importCurrentState(): void {
  // 3 つのステップで 1 つの予算を分け合う。ステップごとに数え直すと 6 分を超える。
  const startedAt = Date.now();

  const labels = importLabels(startedAt);
  const rules = importFilters();
  refreshSenders(startedAt);

  // 再実行では追加が 0 件になるので、内訳を出さないと何が起きたのか分からない。
  activeBook().toast(
    `ラベル 追加 ${labels.added} / 更新 ${labels.updated} / 消失 ${labels.missing} 件` +
      ` (未処理 ${labels.skipped} 件) / ルール ${rules} 件を取り込みました。rules は全て無効の状態です。`,
    'gmail-organizer',
    15
  );
}

interface LabelImportResult {
  /** シートに無かったので追記したラベル数。 */
  added: number;
  /** 既存行を実態に合わせて書き換えたラベル数。 */
  updated: number;
  /** Gmail から消えていたので `状態 = missing` にした行数。 */
  missing: number;
  /** 予算切れで今回触れなかったラベル数。 */
  skipped: number;
}

/**
 * Gmail のユーザーラベルを labels シートへ投入する。
 *
 * 突き合わせのキーは `gmail_label_id`。Gmail のラベル ID は改名しても変わらないので、
 * 改名をそのまま追随できる。ラベル名で突き合わせると、移行で改名したラベルが
 * 「未知のラベル」と判定され、旧名の行を残したまま二重に増える。
 *
 * 人が編集する列 (既定_受信トレイ除外 / 既定_既読化 / 説明) は書き換えない。
 * そこはシート側が正。
 */
function importLabels(startedAt: number): LabelImportResult {
  const all = listGmailLabels();
  const now = new Date();

  const existing: Record<string, Row> = {};
  for (const row of readRows(SHEET_NAMES.LABELS)) {
    const id = String(row['gmailLabelId'] || '').trim();
    if (id !== '') existing[id] = row;
  }

  const rows: Row[] = [];
  const updates: CellUpdate[] = [];
  const seen: Record<string, boolean> = {};
  const result: LabelImportResult = { added: 0, updated: 0, missing: 0, skipped: 0 };

  for (const label of all) {
    if (label.type !== 'user' || !label.name || !label.id) continue;

    // 1 ラベルにつき Labels.get を 1 回呼ぶ。予算を超えたら残りは次の実行に回す。
    if (outOfTime(startedAt)) {
      result.skipped += 1;
      continue;
    }

    seen[label.id] = true;
    // messagesTotal は list では返らないので個別に読む。ラベル数は数十なので許容範囲。
    const detail = Gmail.Users!.Labels!.get('me', label.id);
    const parts = splitLabelPath(label.name);
    const messageCount = detail.messagesTotal || 0;
    const state = messageCount > 0 ? 'active' : 'archived';

    const found = existing[label.id];
    if (!found) {
      rows.push({
        major: parts.major,
        middle: parts.middle,
        minor: parts.minor,
        gmailLabelId: label.id,
        state,
        description: '',
        messageCount,
        syncedAt: now,
      });
      result.added += 1;
      continue;
    }

    const rowNumber = Number(found['_rowNumber']);
    updates.push(
      { rowNumber, key: 'major', value: parts.major },
      { rowNumber, key: 'middle', value: parts.middle },
      { rowNumber, key: 'minor', value: parts.minor },
      { rowNumber, key: 'state', value: state },
      { rowNumber, key: 'messageCount', value: messageCount },
      { rowNumber, key: 'syncedAt', value: now }
    );
    result.updated += 1;
  }

  // Gmail から消えたラベルの行は削除せず状態だけ落とす。行の削除は巻き戻しが効かない。
  // 予算切れで走査しきれなかった実行では判定しない。読めなかっただけのラベルを
  // missing と誤って記録してしまうため。
  if (result.skipped === 0) {
    for (const id of Object.keys(existing)) {
      if (seen[id]) continue;
      const row = existing[id];
      if (String(row['state'] || '').trim() === 'missing') continue;

      const rowNumber = Number(row['_rowNumber']);
      updates.push(
        { rowNumber, key: 'state', value: 'missing' },
        { rowNumber, key: 'syncedAt', value: now }
      );
      result.missing += 1;
    }
  }

  updateCells(SHEET_NAMES.LABELS, updates);
  appendRows(SHEET_NAMES.LABELS, rows);

  if (result.skipped > 0) {
    console.warn(`importLabels: 時間切れで ${result.skipped} 件を残しました。もう一度実行してください`);
  }
  return result;
}

/** 既存の Gmail フィルタを rules シートへ下書きとして投入する。 */
function importFilters(): number {
  const filters = listGmailFilters();
  const labelNames = labelIdToName();
  const known = existingKeys(SHEET_NAMES.RULES, 'pattern');
  const now = new Date();

  const rows: Row[] = [];
  let priority = 100;

  for (const filter of filters) {
    const criteria = filter.criteria || {};
    const action = filter.action || {};

    const label = (action.addLabelIds || [])
      .map((id) => labelNames[id] || '')
      .filter((name) => name !== '')[0] || '';
    const removed = action.removeLabelIds || [];

    for (const pattern of expandFromCriteria(criteria.from || '')) {
      if (known[pattern.value]) continue;
      known[pattern.value] = true;

      rows.push({
        ruleId: '',
        enabled: false,
        priority: priority++,
        kind: pattern.suspicious ? 'from_domain' : 'from',
        pattern: pattern.value,
        label: label,
        location: '',
        skipInbox: removed.indexOf('INBOX') >= 0,
        markRead: removed.indexOf('UNREAD') >= 0,
        star: false,
        neverSpam: removed.indexOf('SPAM') >= 0,
        frozenAt: '',
        memo: pattern.suspicious
          ? '要確認: Gmail はワイルドカードを解釈しないため、元のフィルタは意図通り動いていない可能性が高い'
          : 'Gmail フィルタから取り込み',
        createdAt: now,
        lastMatchedAt: '',
        matchCount: 0,
      });
    }

    if (criteria.query) {
      rows.push({
        ruleId: '',
        enabled: false,
        priority: priority++,
        kind: 'query',
        pattern: criteria.query,
        label: label,
        location: '',
        skipInbox: removed.indexOf('INBOX') >= 0,
        markRead: removed.indexOf('UNREAD') >= 0,
        star: false,
        neverSpam: removed.indexOf('SPAM') >= 0,
        frozenAt: '',
        memo: 'Gmail フィルタの検索式から取り込み',
        createdAt: now,
        lastMatchedAt: '',
        matchCount: 0,
      });
    }
  }

  appendRows(SHEET_NAMES.RULES, rows);
  return rows.length;
}

interface ExtractedPattern {
  value: string;
  /** Gmail が解釈しないワイルドカードを含む = 元フィルタが怪しい。 */
  suspicious: boolean;
}

/**
 * `({ from: *.agoda-emails.com from: jpmail@expediamail.com })` のような
 * 束ねた条件を個々のパターンへ展開する。
 *
 * `*` を含むものは、Gmail がワイルドカードとして扱わないためドメイン一致に倒し、
 * メモで要確認と印を付ける。
 */
function expandFromCriteria(raw: string): ExtractedPattern[] {
  if (!raw) return [];

  const tokens = raw
    .replace(/from:/gi, ' ')
    .replace(/[(){}]/g, ' ')
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token !== '' && token.indexOf('.') >= 0);

  const seen: Record<string, boolean> = {};
  const patterns: ExtractedPattern[] = [];

  for (const token of tokens) {
    const suspicious = token.indexOf('*') >= 0;
    // 正規表現のつもりで書かれた \. と、ワイルドカードのつもりの * を落とす。
    const cleaned = token.replace(/\\/g, '').replace(/^\*+@?/, '').replace(/^\.+/, '').toLowerCase();
    if (cleaned === '' || seen[cleaned]) continue;
    seen[cleaned] = true;
    patterns.push({ value: cleaned, suspicious });
  }
  return patterns;
}

/** Gmail のラベル ID → 名前の対応表。 */
function labelIdToName(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const label of listGmailLabels()) {
    if (label.id && label.name) map[label.id] = label.name;
  }
  return map;
}

/** 既に取り込み済みの値を引くための集合。二重登録を防ぐ。 */
function existingKeys(sheetName: string, key: string): Record<string, boolean> {
  const seen: Record<string, boolean> = {};
  for (const row of readRows(sheetName)) {
    const value = String(row[key] || '').trim();
    if (value !== '') seen[value] = true;
  }
  return seen;
}
