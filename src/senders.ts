/**
 * 送信元マスタ (メーリングリスト DB)。
 *
 * 送信元アドレスとラベルの対応だけでは「どの会社の、どのサービスからか」が
 * 分からない。1 つの会社が複数のアドレス・複数のサービスを使うのが普通で、
 * 同じリクルートでも じゃらん・ホットペッパービューティー・リクルートエージェントで
 * 行き先が変わる。運営元とサービスを分けて持たないと整理できない。
 *
 * `運営元` と `サービス` は機械では埋まらない。人と週次 AI が育てる列。
 */

/** 1 ページあたりの走査数。 */
const SENDER_PAGE_SIZE = 100;

interface SenderObservation {
  address: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  messageId: string;
}

/**
 * 受信メールを走査して送信元マスタを更新する。
 *
 * 既存の行は上書きせず、観測した値だけを更新する。
 * `運営元` / `サービス` / `備考` など人が育てた列には触れない。
 */
function refreshSenders(): void {
  const startedAt = Date.now();
  const window = readConfig('SENDER_SCAN_WINDOW', CONFIG.SENDER_SCAN_WINDOW);
  const observed = scanSenders(window, startedAt);

  const rows = readRows(SHEET_NAMES.SENDERS);
  const known: Record<string, Row> = {};
  for (const row of rows) {
    const address = String(row['address'] || '').trim().toLowerCase();
    if (address !== '') known[address] = row;
  }

  const added: Row[] = [];
  let updated = 0;

  for (const address of Object.keys(observed)) {
    const seen = observed[address];
    const existing = known[address];

    if (!existing) {
      added.push(buildSenderRow(seen));
      continue;
    }
    updateSenderRow(existing, seen);
    updated += 1;
  }

  appendRows(SHEET_NAMES.SENDERS, added);
  markDormantSenders(rows, observed);

  console.log(`refreshSenders: 新規 ${added.length} 件 / 更新 ${updated} 件`);
}

/** 走査して送信元ごとに集計する。6 分制限に収まるよう時間を見て打ち切る。 */
function scanSenders(window: string, startedAt: number): Record<string, SenderObservation> {
  const observed: Record<string, SenderObservation> = {};
  let start = 0;

  for (;;) {
    if (Date.now() - startedAt > CONFIG.MAX_RUNTIME_MS) {
      console.warn('scanSenders: 時間切れで打ち切りました。直近90日は過小になります');
      break;
    }

    const threads = GmailApp.search(window, start, SENDER_PAGE_SIZE);
    if (threads.length === 0) break;

    for (const thread of threads) {
      const head = thread.getMessages()[0];
      if (!head) continue;

      const address = extractAddress(head.getFrom());
      if (address === '') continue;
      const at = new Date(head.getDate().getTime());

      if (!observed[address]) {
        observed[address] = { address, count: 0, firstSeen: at, lastSeen: at, messageId: head.getId() };
      }
      const seen = observed[address];
      seen.count += 1;
      if (at < seen.firstSeen) seen.firstSeen = at;
      if (at > seen.lastSeen) seen.lastSeen = at;
    }

    start += threads.length;
    if (threads.length < SENDER_PAGE_SIZE) break;
  }
  return observed;
}

/**
 * 新しい送信元の行を組み立てる。
 * `List-Id` は新規のときだけ 1 通読む。メーリングリストならそのまま
 * `list_id` 種別のルールのパターンになる。
 */
function buildSenderRow(seen: SenderObservation): Row {
  return {
    address: seen.address,
    operator: '',
    service: '',
    kind: '',
    label: '',
    listId: lookupListId(seen.messageId),
    location: '',
    cadence: '',
    recentCount: seen.count,
    firstSeen: seen.firstSeen,
    lastSeen: seen.lastSeen,
    state: 'active',
    unsubscribe: false,
    memo: '',
  };
}

/** 観測できる列だけを更新する。人が育てた列には触れない。 */
function updateSenderRow(existing: Row, seen: SenderObservation): void {
  const rowNumber = Number(existing['_rowNumber']);

  updateCell(SHEET_NAMES.SENDERS, rowNumber, 'recentCount', seen.count);
  updateCell(SHEET_NAMES.SENDERS, rowNumber, 'lastSeen', seen.lastSeen);
  updateCell(SHEET_NAMES.SENDERS, rowNumber, 'state', 'active');

  const firstSeen = existing['firstSeen'];
  if (!(firstSeen instanceof Date) || seen.firstSeen < firstSeen) {
    updateCell(SHEET_NAMES.SENDERS, rowNumber, 'firstSeen', seen.firstSeen);
  }
}

/** しばらく届いていない送信元を dormant にする。解約済みの見落としを拾うため。 */
function markDormantSenders(rows: Row[], observed: Record<string, SenderObservation>): void {
  const threshold = Date.now() - CONFIG.SENDER_DORMANT_DAYS * 24 * 60 * 60 * 1000;

  for (const row of rows) {
    const address = String(row['address'] || '').trim().toLowerCase();
    if (address === '' || observed[address]) continue;
    if (String(row['state'] || '') !== 'active') continue;

    const lastSeen = row['lastSeen'];
    if (lastSeen instanceof Date && lastSeen.getTime() >= threshold) continue;

    updateCell(SHEET_NAMES.SENDERS, Number(row['_rowNumber']), 'state', 'dormant');
  }
}

/**
 * 運営元ごとの通数をまとめる。
 * 「リクルート系だけで 4 サービス、直近 90 日で 300 通」のような把握に使う。
 */
function summarizeByOperator(): Record<string, { services: number; count: number }> {
  const totals: Record<string, { services: number; count: number }> = {};

  for (const row of readRows(SHEET_NAMES.SENDERS)) {
    const operator = String(row['operator'] || '').trim();
    if (operator === '') continue;

    if (!totals[operator]) totals[operator] = { services: 0, count: 0 };
    totals[operator].services += 1;
    totals[operator].count += Number(row['recentCount']) || 0;
  }
  return totals;
}
