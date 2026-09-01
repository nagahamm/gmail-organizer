/**
 * 週次の集計。
 *
 * 週次 AI が読む入力 (`unmatched` シート) を作る。
 * ダイジェストはシートと自分宛メールの両方に出す。定期実行セッションから
 * Gmail / Drive のどちらの経路でも読めるようにするため (docs/design.md 5.3)。
 */

/** 未分類の送信元を上位いくつまで詳しく調べるか。ヘッダ読みを伴うので絞る。 */
const DIGEST_TOP_SENDERS = 30;

/** log をこの日数より古い分だけ退避する。 */
const LOG_RETENTION_DAYS = 180;

/** この日数マッチしていないルールを死んだルールとして報告する。 */
const DEAD_RULE_DAYS = 90;

function runWeeklyDigest(): void {
  // importCurrentState() と同じく、続けて回すステップで 1 つの予算を分け合う。
  const startedAt = Date.now();

  // 安くて確実に効かせたいものから先に済ませる。
  // 集計や提案を先に走らせると、予算を使い切って掃除と検査が毎回飛ばされる。
  const archived = archiveOldLogs();
  const expired = archiveExpiredInbox(startedAt);
  const problems = validateSheets(startedAt);
  const deadRules = findDeadRules();

  // ここから先は重い。残り時間の範囲で拾えるだけ拾う。
  const unmatched = collectUnmatched(startedAt);
  replaceRows(SHEET_NAMES.UNMATCHED, unmatched.rows);

  // 未分類の集計ができた直後に立てる。除外候補の印をそのまま提案にする。
  proposeInboxSkips();

  refreshSenders(startedAt);
  proposeAppliedJobs();

  sendDigestMail(unmatched, deadRules, archived, expired, problems);
  console.log(
    `runWeeklyDigest: 未分類 ${unmatched.rows.length} 件 / 死んだルール ${deadRules.length} 件 / ` +
      `ログ退避 ${archived} 行 / 保持期間切れ ${expired} 件 / 型の問題 ${problems.length} 件`
  );
}

interface UnmatchedStat {
  domain: string;
  address: string;
  messageId: string;
  /** Gmail が付けたカテゴリ。受信トレイ除外を提案してよいかの根拠になる。 */
  category: string;
  count: number;
  unread: number;
  firstSeen: Date;
  subject: string;
}

/**
 * 受信トレイの未ラベルを、Gmail のカテゴリ別に引く。
 *
 * カテゴリは Gmail が既に分類した結果で、そのまま「受信トレイ除外の候補」の
 * 根拠になる。使わない手はない。`(なし)` はどのタブにも入らなかったもので、
 * 個人のやり取りや取引メールが多いため除外提案の対象にしない。
 *
 * 受信トレイに限定するのは、既にアーカイブ済みのものが混ざると
 * 「受信トレイから外すべきか」の判断材料として濁るため。
 */
const UNMATCHED_CATEGORIES: { name: string; query: string }[] = [
  { name: 'promotions', query: 'category:promotions' },
  { name: 'social', query: 'category:social' },
  { name: 'updates', query: 'category:updates' },
  { name: '(なし)', query: '-category:promotions -category:social -category:updates' },
];

/** 受信トレイ除外を提案してよいカテゴリ。 */
const SKIP_INBOX_CATEGORIES = ['promotions', 'social', 'updates'];

/** これ以上読まれていなければ除外候補にする。 */
const SKIP_INBOX_UNREAD_RATE = 0.8;

interface UnmatchedResult {
  rows: Row[];
  scanned: number;
  /** 予算切れで見きれなかったカテゴリがあるか。集計を全量として見せないため。 */
  truncated: boolean;
}

/**
 * どのユーザーラベルも付いていないメールを送信元ドメイン別に集計する。
 * 未読率が高いものは「読む気がない」= 受信トレイ除外の候補。
 */
function collectUnmatched(startedAt?: number): UnmatchedResult {
  const since = budgetStart(startedAt);
  const stats: Record<string, UnmatchedStat> = {};
  let scanned = 0;
  let truncated = false;

  for (const category of UNMATCHED_CATEGORIES) {
    if (outOfTime(since)) {
      console.warn(`collectUnmatched: 時間切れで ${category.name} 以降を見ていません`);
      truncated = true;
      break;
    }

    const query = `in:inbox has:nouserlabels ${category.query}`;
    const threads = GmailApp.search(query, 0, CONFIG.SEARCH_PAGE_SIZE);
    scanned += threads.length;

    // スレッドごとに getMessages() を呼ぶと 1 スレッド 1 コールになる。
    // まとめて取れる API があるのでそちらを使う。
    const messages = GmailApp.getMessagesForThreads(threads);

    for (let at = 0; at < threads.length; at += 1) {
      const thread = threads[at];
      const head = messages[at] ? messages[at][0] : null;
      if (!head) continue;

      const address = extractAddress(head.getFrom());
      const domain = senderDomain(head.getFrom()) || '(不明)';
      const date = new Date(head.getDate().getTime());

      if (!stats[domain]) {
        stats[domain] = {
          domain,
          address,
          messageId: head.getId(),
          category: category.name,
          count: 0,
          unread: 0,
          firstSeen: date,
          subject: truncateSubject(head.getSubject() || ''),
        };
      }
      stats[domain].count += 1;
      if (thread.isUnread()) stats[domain].unread += 1;
      if (date < stats[domain].firstSeen) stats[domain].firstSeen = date;
    }
  }

  const ranked = Object.keys(stats)
    .map((domain) => stats[domain])
    .sort((a, b) => b.count - a.count)
    .slice(0, DIGEST_TOP_SENDERS);

  const at = new Date();
  const rows: Row[] = ranked.map((stat) => {
    return {
      at,
      from: stat.address,
      listId: lookupListId(stat.messageId),
      category: stat.category,
      count7d: stat.count,
      countTotal: countFromDomain(stat.domain),
      unreadRate: percent(stat.unread, stat.count),
      firstSeen: stat.firstSeen,
      sampleSubject: stat.subject,
      skipInboxCandidate: isSkipInboxCandidate(stat),
      proposed: false,
    };
  });

  return { rows, scanned, truncated };
}

/**
 * 受信トレイ除外を提案してよいか。
 *
 * Gmail がプロモーション / ソーシャル / 新着へ振り分けていて、かつ実際に読んでいない。
 * この 2 つが揃って初めて候補にする。カテゴリだけで決めないのは、`updates` に
 * 請求書や認証コードが混ざるため。機械的に外すと「静かに消える」が再発する。
 *
 * ここで作るのは提案であって適用ではない。承認するかは人が決める。
 */
function isSkipInboxCandidate(stat: UnmatchedStat): boolean {
  if (SKIP_INBOX_CATEGORIES.indexOf(stat.category) < 0) return false;
  if (stat.count === 0) return false;
  return stat.unread / stat.count >= SKIP_INBOX_UNREAD_RATE;
}

/**
 * 送信元ドメインの総数。
 * 1 回の検索で取れる上限までしか数えないので、上限に達した場合は下限値になる。
 */
function countFromDomain(domain: string): number {
  if (domain === '(不明)') return 0;
  return GmailApp.search(`from:(${sanitizeQueryValue(domain)})`, 0, CONFIG.SEARCH_PAGE_SIZE).length;
}

/**
 * List-Id を 1 通だけ読む。
 * メーリングリストならこれがそのままルールのパターンになる。
 */
function lookupListId(messageId: string): string {
  try {
    const headers = messageHeaders(messageId, ['List-Id']);
    return normalizeListId(headers['list-id'] || '');
  } catch (error) {
    return '';
  }
}

interface DeadRule {
  ruleId: string;
  pattern: string;
  label: string;
  lastMatchedAt: Date | null;
}

/** しばらくマッチしていないルール。ルールの増殖に歯止めをかけるため。 */
function findDeadRules(): DeadRule[] {
  const threshold = Date.now() - DEAD_RULE_DAYS * 24 * 60 * 60 * 1000;
  const dead: DeadRule[] = [];

  for (const row of readRows(SHEET_NAMES.RULES)) {
    if (row['enabled'] !== true) continue;

    const lastMatchedAt = row['lastMatchedAt'] instanceof Date ? (row['lastMatchedAt'] as Date) : null;
    if (lastMatchedAt && lastMatchedAt.getTime() >= threshold) continue;

    dead.push({
      ruleId: String(row['ruleId'] || row['_rowNumber']),
      pattern: String(row['pattern'] || ''),
      label: String(row['label'] || ''),
      lastMatchedAt,
    });
  }
  return dead;
}

/** 古いログ行を退避シートへ移す。log が際限なく伸びるのを防ぐ。 */
function archiveOldLogs(): number {
  const threshold = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const rows = readRows(SHEET_NAMES.LOG);

  const old = rows.filter((row) => row['at'] instanceof Date && (row['at'] as Date).getTime() < threshold);
  if (old.length === 0) return 0;

  appendRows(SHEET_NAMES.LOG_ARCHIVE, old);
  replaceRows(SHEET_NAMES.LOG, rows.filter((row) => old.indexOf(row) < 0));
  return old.length;
}

function sendDigestMail(
  unmatched: UnmatchedResult,
  deadRules: DeadRule[],
  archived: number,
  expired: number,
  problems: SheetProblem[]
): void {
  const to = readConfig('NOTIFY_TO', '') || Session.getActiveUser().getEmail();
  if (!to) return;

  const inbox = GmailApp.getInboxUnreadCount();
  const lines: string[] = [];

  lines.push('gmail-organizer 週次ダイジェスト');
  lines.push('');
  lines.push(`受信トレイの未読: ${inbox} 通`);
  lines.push(
    `受信トレイの未分類スレッド: ${unmatched.scanned} 件` +
      (unmatched.truncated ? ' (時間切れで途中まで。全量ではありません)' : '')
  );
  lines.push(`ログ退避: ${archived} 行`);
  lines.push(`保持期間を過ぎて受信トレイから外した: ${expired} 件`);
  lines.push('');

  // 型崩れは他の集計を狂わせるので先頭に出す。
  for (const line of describeProblems(problems)) lines.push(line);

  if (unmatched.rows.length > 0) {
    lines.push(`■ 未分類の送信元 上位 ${unmatched.rows.length} 件`);
    for (const row of unmatched.rows) {
      const listId = row['listId'] ? ` / list:${row['listId']}` : '';
      const skip = row['skipInboxCandidate'] ? ' ← 受信トレイ除外の候補' : '';
      lines.push(
        `  [${row['category']}] ${row['from']}${listId} — ${row['count7d']} 通、` +
          `未読率 ${row['unreadRate']}${skip}`
      );
    }
    lines.push('');
  }

  if (deadRules.length > 0) {
    lines.push(`■ ${DEAD_RULE_DAYS} 日マッチしていないルール ${deadRules.length} 件`);
    for (const rule of deadRules) {
      const when = rule.lastMatchedAt ? Utilities.formatDate(rule.lastMatchedAt, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '一度も';
      lines.push(`  ${rule.pattern} → ${rule.label} (最終 ${when})`);
    }
    lines.push('');
  }

  const operators = summarizeByOperator();
  const names = Object.keys(operators).sort((a, b) => operators[b].count - operators[a].count).slice(0, 10);
  if (names.length > 0) {
    lines.push('■ 運営元別の通数 (直近90日)');
    for (const name of names) {
      lines.push(`  ${name} — ${operators[name].services} サービス、${operators[name].count} 通`);
    }
    lines.push('');
  }

  lines.push('詳細は unmatched シートと senders シートを参照。提案は proposals シートへ書き込まれます。');

  GmailApp.sendEmail(to, `[gmail-organizer] 週次ダイジェスト 未分類 ${unmatched.rows.length} 件`, lines.join('\n'));
}
