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
  const unmatched = collectUnmatched();
  replaceRows(SHEET_NAMES.UNMATCHED, unmatched.rows);

  refreshSenders();
  proposeAppliedJobs();
  const deadRules = findDeadRules();
  const archived = archiveOldLogs();

  sendDigestMail(unmatched, deadRules, archived);
  console.log(`runWeeklyDigest: 未分類 ${unmatched.rows.length} 件 / 死んだルール ${deadRules.length} 件 / ログ退避 ${archived} 行`);
}

interface UnmatchedStat {
  domain: string;
  address: string;
  messageId: string;
  count: number;
  unread: number;
  firstSeen: Date;
  subject: string;
}

interface UnmatchedResult {
  rows: Row[];
  scanned: number;
}

/**
 * どのユーザーラベルも付いていないメールを送信元ドメイン別に集計する。
 * 未読率が高いものは「読む気がない」= 受信トレイ除外の候補。
 */
function collectUnmatched(): UnmatchedResult {
  const threads = GmailApp.search('newer_than:7d -has:userlabels', 0, CONFIG.SEARCH_PAGE_SIZE);
  const stats: Record<string, UnmatchedStat> = {};

  for (const thread of threads) {
    const head = thread.getMessages()[0];
    if (!head) continue;

    const address = extractAddress(head.getFrom());
    const domain = senderDomain(head.getFrom()) || '(不明)';
    const date = new Date(head.getDate().getTime());

    if (!stats[domain]) {
      stats[domain] = {
        domain,
        address,
        messageId: head.getId(),
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
      count7d: stat.count,
      countTotal: countFromDomain(stat.domain),
      unreadRate: percent(stat.unread, stat.count),
      firstSeen: stat.firstSeen,
      sampleSubject: stat.subject,
      proposed: false,
    };
  });

  return { rows, scanned: threads.length };
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

function sendDigestMail(unmatched: UnmatchedResult, deadRules: DeadRule[], archived: number): void {
  const to = readConfig('NOTIFY_TO', '') || Session.getActiveUser().getEmail();
  if (!to) return;

  const inbox = GmailApp.getInboxUnreadCount();
  const lines: string[] = [];

  lines.push('gmail-organizer 週次ダイジェスト');
  lines.push('');
  lines.push(`受信トレイの未読: ${inbox} 通`);
  lines.push(`直近 7 日で未分類だったスレッド: ${unmatched.scanned} 件`);
  lines.push(`ログ退避: ${archived} 行`);
  lines.push('');

  if (unmatched.rows.length > 0) {
    lines.push(`■ 未分類の送信元 上位 ${unmatched.rows.length} 件`);
    for (const row of unmatched.rows) {
      const listId = row['listId'] ? ` / list:${row['listId']}` : '';
      lines.push(`  ${row['from']}${listId} — 7日 ${row['count7d']} 通、未読率 ${row['unreadRate']}`);
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
