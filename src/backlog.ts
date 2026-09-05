/**
 * 過去の未分類の洗い出し。
 *
 * 遡及適用を流し切ったあとに残るのは、**ルールがそもそも無い送信元**である。
 * ルールは過去 1 年の観測から作ったので、それより前にしか出てこないものは拾えない。
 * 受信トレイに限らず、アーカイブ済みも含めて棚卸しする。
 *
 * 週次の `unmatched` とは別のシートに出す。あちらは毎回置き換わるので、
 * 何日かかけて積み上げる途中経過を置くと日曜に消える (docs/requirements.md)。
 */

/** 洗い出しの再開位置。`start` だけを使い、`ruleIndex` は見ない。 */
const BACKLOG_CURSOR_KEY = 'BACKLOG_CURSOR';

/**
 * 対象。下書きと自分の送信を除く。
 *
 * `in:sent` を外さないと、自分が出したメールが送信元として並ぶ。
 * 迷惑メールとゴミ箱は Gmail の検索が既定で外すので書かない。
 */
const BACKLOG_QUERY = 'has:nouserlabels -in:sent -in:draft -in:chats';

/** 1 回の実行で list_id を引く上限。1 通 1 コールなので絞る。 */
const BACKLOG_LISTID_LOOKUPS = 20;

interface BacklogStat {
  domain: string;
  address: string;
  listId: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  sampleSubject: string;
}

/**
 * 同じドメインの集計を 1 つにまとめる。
 *
 * 件数は足し、期間は広げる。代表アドレス・件名・`list_id` は**先に入ったものを残す**。
 * 後から来たもので上書きすると、実行を跨ぐたびに代表が入れ替わって落ち着かない。
 *
 * GAS API に触れないので `npm test` で検証できる。
 */
function mergeBacklogStat(current: BacklogStat | null, incoming: BacklogStat): BacklogStat {
  if (!current) return incoming;

  return {
    domain: current.domain,
    address: current.address || incoming.address,
    listId: current.listId || incoming.listId,
    count: current.count + incoming.count,
    firstSeen: incoming.firstSeen < current.firstSeen ? incoming.firstSeen : current.firstSeen,
    lastSeen: incoming.lastSeen > current.lastSeen ? incoming.lastSeen : current.lastSeen,
    sampleSubject: current.sampleSubject || incoming.sampleSubject,
  };
}

/**
 * 過去の未分類を洗い出す。
 *
 * 6 分と日次予算のどちらかに当たったら再開位置を残して抜ける。
 * 続きは 15 分ジョブの `continueBacklog()` が拾う。
 */
function surveyBacklog(startedAt?: number): void {
  const since = budgetStart(startedAt);

  // 中断中の遡及があるうちは動かさない。ラベルが付くたびに検索結果が縮み、
  // 位置で送るこの走査が取りこぼす。先に遡及を終わらせるほど残りが正確になる。
  if (anyRetroCursor()) {
    console.log('surveyBacklog: 中断中の遡及があります。そちらが終わってから流します');
    return;
  }

  const budget = readDailyBudget();
  const today = todayKey();
  let usage = readDailyUsage();

  const stats = readBacklogStats();
  let start = readCursor(BACKLOG_CURSOR_KEY).start;
  let lookups = 0;
  let scanned = 0;

  for (;;) {
    if (outOfTime(since) || !hasDailyBudget(usage, today, budget)) {
      writeCursor(BACKLOG_CURSOR_KEY, { ruleIndex: 0, start });
      writeDailyUsage(usage);
      writeBacklogStats(stats);
      console.log(`surveyBacklog: 中断。${scanned} スレッド走査、位置 ${start}`);
      return;
    }

    const threads = GmailApp.search(BACKLOG_QUERY, start, CONFIG.SEARCH_PAGE_SIZE);
    if (threads.length === 0) break;

    // スレッドごとに getMessages() を呼ぶと 1 スレッド 1 コールになる。
    const messages = GmailApp.getMessagesForThreads(threads);

    for (let at = 0; at < threads.length; at += 1) {
      const head = messages[at] ? messages[at][0] : null;
      if (!head) continue;

      const domain = senderDomain(head.getFrom()) || '(不明)';
      const date = new Date(head.getDate().getTime());
      const known = stats[domain] || null;

      // list_id は新しいドメインのときだけ引く。1 通 1 コールなので上限も設ける。
      let listId = known ? known.listId : '';
      if (!known && lookups < BACKLOG_LISTID_LOOKUPS) {
        listId = lookupListId(head.getId());
        lookups += 1;
      }

      stats[domain] = mergeBacklogStat(known, {
        domain: domain,
        address: extractAddress(head.getFrom()),
        listId: listId,
        count: 1,
        firstSeen: date,
        lastSeen: date,
        sampleSubject: truncateSubject(head.getSubject()),
      });
    }

    scanned += threads.length;
    start += threads.length;
    usage = rollDailyUsage(usage, today, threads.length);

    if (threads.length < CONFIG.SEARCH_PAGE_SIZE) break;
  }

  clearCursor(BACKLOG_CURSOR_KEY);
  writeDailyUsage(usage);
  writeBacklogStats(stats);
  console.log(`surveyBacklog: 完了。${scanned} スレッド走査、${Object.keys(stats).length} ドメイン`);
}

/**
 * 中断した洗い出しの続きを流す。15 分ごとのジョブから呼ぶ。
 *
 * 再開位置が残っているときだけ動く。遡及と同じ歯止め。
 */
function continueBacklog(startedAt?: number): void {
  if (!hasCursor(BACKLOG_CURSOR_KEY)) return;
  surveyBacklog(startedAt);
}

/** 洗い出しの再開位置を捨てて最初からやり直す。集計済みの行は消さない。 */
function resetBacklog(): void {
  clearCursor(BACKLOG_CURSOR_KEY);
  console.log('過去の未分類の洗い出しの再開位置を消しました');
}

/** backlog シートの行を集計の形に戻す。実行を跨いで積み上げるため。 */
function readBacklogStats(): Record<string, BacklogStat> {
  const stats: Record<string, BacklogStat> = {};

  for (const row of readRows(SHEET_NAMES.BACKLOG)) {
    const domain = String(row['domain'] || '').trim();
    if (domain === '') continue;

    const firstSeen = row['firstSeen'] instanceof Date ? (row['firstSeen'] as Date) : new Date();
    const lastSeen = row['lastSeen'] instanceof Date ? (row['lastSeen'] as Date) : firstSeen;

    stats[domain] = {
      domain: domain,
      address: String(row['address'] || ''),
      listId: String(row['listId'] || ''),
      count: Number(row['count']) || 0,
      firstSeen: firstSeen,
      lastSeen: lastSeen,
      sampleSubject: String(row['sampleSubject'] || ''),
    };
  }

  return stats;
}

/** 件数の多い順に並べて書き戻す。ルールを書く価値が高いものが上に来る。 */
function writeBacklogStats(stats: Record<string, BacklogStat>): void {
  const at = new Date();
  const rows: Row[] = Object.keys(stats)
    .map((domain) => stats[domain])
    .sort((a, b) => b.count - a.count)
    .map((stat) => {
      return {
        domain: stat.domain,
        address: stat.address,
        listId: stat.listId,
        count: stat.count,
        firstSeen: stat.firstSeen,
        lastSeen: stat.lastSeen,
        sampleSubject: stat.sampleSubject,
        updatedAt: at,
      };
    });

  replaceRows(SHEET_NAMES.BACKLOG, rows);
}
