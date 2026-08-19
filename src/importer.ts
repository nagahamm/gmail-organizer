/**
 * 既存のラベルと Gmail フィルタをシートへ取り込む。
 *
 * ラベル 39 個とフィルタを手入力するのは現実的でない。当初の課題
 * 「登録が面倒」を初期コストとして繰り返さないために機械的に吸い出す。
 *
 * 取り込んだルールは全て `有効 = FALSE` で入る。人が確認してから有効化する。
 */

function importCurrentState(): void {
  const labels = importLabels();
  const rules = importFilters();
  activeBook().toast(
    `ラベル ${labels} 件 / ルール ${rules} 件を取り込みました。rules は全て無効の状態です。`,
    'gmail-organizer',
    15
  );
}

/** Gmail のユーザーラベルを labels シートへ投入する。 */
function importLabels(): number {
  const listed = Gmail.Users!.Labels!.list('me');
  const all = listed.labels || [];
  const known = existingKeys(SHEET_NAMES.LABELS, 'fullPath');
  const now = new Date();

  const rows: Row[] = [];
  for (const label of all) {
    if (label.type !== 'user' || !label.name || !label.id) continue;
    if (known[label.name]) continue;

    // messagesTotal は list では返らないので個別に読む。ラベル数は数十なので許容範囲。
    const detail = Gmail.Users!.Labels!.get('me', label.id);
    const parts = splitLabelPath(label.name);

    rows.push({
      labelKey: label.id,
      major: parts.major,
      middle: parts.middle,
      minor: parts.minor,
      gmailLabelId: label.id,
      defaultSkipInbox: false,
      defaultMarkRead: false,
      state: (detail.messagesTotal || 0) > 0 ? 'active' : 'archived',
      description: '',
      messageCount: detail.messagesTotal || 0,
      syncedAt: now,
    });
  }

  appendRows(SHEET_NAMES.LABELS, rows);
  return rows.length;
}

/** 既存の Gmail フィルタを rules シートへ下書きとして投入する。 */
function importFilters(): number {
  const listed = Gmail.Users!.Settings!.Filters!.list('me');
  const filters = listed.filter || [];
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
  const listed = Gmail.Users!.Labels!.list('me');
  const map: Record<string, string> = {};
  for (const label of listed.labels || []) {
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
