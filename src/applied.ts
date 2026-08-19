/**
 * 応募済みスレッドの検出。
 *
 * 「スレッドに自分の送信が含まれる」は Gmail の検索式で表現できない。
 * 検索条件はメッセージ単位で評価されるため、`from:me AND from:seek.com.au` は
 * 「両方を同時に満たす 1 通」を探してしまい何も返らない。
 *
 * かといって `from:me` をそのまま Job/Applied にすると、印刷注文や
 * サポート問い合わせまで巻き込む。そこで自動付与ではなく提案にして、
 * 承認ループ (proposals.ts) に載せる。
 */

/** 1 回に出す提案の上限。シートを提案で埋め尽くさないため。 */
const APPLIED_PROPOSAL_LIMIT = 30;

function proposeAppliedJobs(): void {
  const me = Session.getActiveUser().getEmail().toLowerCase();
  const threads = GmailApp.search('from:me -in:chats', 0, CONFIG.SEARCH_PAGE_SIZE);

  const covered = coveredPatterns();
  const seen: Record<string, boolean> = {};
  const at = new Date();
  const rows: Row[] = [];

  for (const thread of threads) {
    if (rows.length >= APPLIED_PROPOSAL_LIMIT) break;
    if (hasLabel(thread, CONFIG.APPLIED_LABEL)) continue;

    const counterpart = findCounterpart(thread, me);
    if (counterpart === '' || seen[counterpart]) continue;
    if (covered[counterpart] || covered[domainOf(counterpart)]) continue;
    seen[counterpart] = true;

    const head = thread.getMessages()[0];
    const when = Utilities.formatDate(thread.getLastMessageDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

    rows.push({
      at,
      proposalId: `applied-${counterpart}`,
      kind: 'new_rule',
      rationale: `自分が返信したスレッド。最終 ${when} / 件名: ${truncateSubject(head ? head.getSubject() : '')}`,
      summary: `from:${counterpart} → ${CONFIG.APPLIED_LABEL}`,
      matchKind: 'from',
      pattern: counterpart,
      label: CONFIG.APPLIED_LABEL,
      approval: '未確認',
      appliedAt: '',
      comment: '求人のやり取りなら承認してください。印刷注文やサポート問い合わせなら却下してください。',
    });
  }

  appendRows(SHEET_NAMES.PROPOSALS, rows);
  console.log(`proposeAppliedJobs: ${rows.length} 件を提案しました`);
}

/**
 * やり取りの相手を 1 つ選ぶ。
 * 受信したメッセージがあればその送信元、無ければ自分が送った宛先。
 */
function findCounterpart(thread: GoogleAppsScript.Gmail.GmailThread, me: string): string {
  const messages = thread.getMessages();

  for (const message of messages) {
    const from = extractAddress(message.getFrom());
    if (from !== '' && from !== me) return from;
  }

  for (const message of messages) {
    const to = extractAddress(message.getTo().split(',')[0] || '');
    if (to !== '' && to !== me) return to;
  }
  return '';
}

/** 既存ルールが既に拾っているパターン。同じ相手を何度も提案しないため。 */
function coveredPatterns(): Record<string, boolean> {
  const covered: Record<string, boolean> = {};

  for (const row of readRows(SHEET_NAMES.RULES)) {
    const pattern = String(row['pattern'] || '').trim().toLowerCase();
    if (pattern !== '') covered[pattern] = true;
  }
  for (const row of readRows(SHEET_NAMES.PROPOSALS)) {
    const pattern = String(row['pattern'] || '').trim().toLowerCase();
    if (pattern !== '') covered[pattern] = true;
  }
  return covered;
}

function hasLabel(thread: GoogleAppsScript.Gmail.GmailThread, name: string): boolean {
  return thread.getLabels().some((label) => label.getName() === name);
}

function domainOf(address: string): string {
  const at = address.lastIndexOf('@');
  return at < 0 ? '' : address.slice(at + 1);
}
