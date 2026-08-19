/**
 * 移行前の実態調査。
 *
 * docs/label-migration.md の要判断ポイントは、実データを見ないと決められない。
 * 推測でマッピングを確定させると 6,641 通を誤った場所へ動かすことになる。
 *
 * このファイルは読み取り専用。ラベルの付与・変更は一切しない。
 */

/** 調査対象。移行時限りのものなので、移行が終わればこのファイルごと消えてよい。 */
const SAMPLING_TARGETS = {
  /** 取引メールが混ざっていないかを見るラベル。 */
  MIXED_CHECK: ['Australia/Stores'],
  /** 求人の送信元分布を見るラベル。 */
  JOB_LABELS: ['プロモーション/Employment', 'Australia/Employment'],
} as const;

/** 注文・発送・領収を示す件名。取引メールの混入を測るための目安。 */
const TRANSACTIONAL_HINTS = [
  'ご注文', '注文', '発送', '配送', '出荷', '領収', '請求', 'お支払い',
  'order', 'shipped', 'shipping', 'dispatch', 'receipt', 'invoice', 'delivery',
];

/** 応募済みを示す件名。Job/Applied の自動判定率を測るための目安。 */
const APPLIED_HINTS = [
  'ご応募', '応募', '選考', '面接', '書類選考', 'エントリー',
  'application received', 'thanks for applying', 'thank you for applying',
  'your application', 'interview',
];

function runSampling(): void {
  const startedAt = Date.now();
  const rows: Row[] = [];

  for (const label of SAMPLING_TARGETS.MIXED_CHECK) {
    rows.push(...surveySenders(label, '取引混入の確認', TRANSACTIONAL_HINTS, startedAt));
  }
  for (const label of SAMPLING_TARGETS.JOB_LABELS) {
    rows.push(...surveySenders(label, '求人の送信元分布', APPLIED_HINTS, startedAt));
  }
  rows.push(...surveyAppliedDetection(startedAt));

  replaceRows(SHEET_NAMES.SAMPLING, rows);
  activeBook().toast(`サンプリング完了。${rows.length} 行を出力しました。`, 'gmail-organizer', 10);
}

interface SenderStat {
  count: number;
  hits: number;
  subject: string;
}

/** ラベル配下を送信元ドメイン別に集計し、目安の件名に当たった率を添える。 */
function surveySenders(labelName: string, survey: string, hints: string[], startedAt: number): Row[] {
  const threads = searchLabel(labelName);
  const at = new Date();
  const stats: Record<string, SenderStat> = {};
  let scanned = 0;

  for (const thread of threads) {
    if (Date.now() - startedAt > CONFIG.MAX_RUNTIME_MS) break;

    const messages = thread.getMessages();
    if (messages.length === 0) continue;
    const head = messages[0];

    const domain = senderDomain(head.getFrom()) || '(不明)';
    const subject = head.getSubject() || '';
    if (!stats[domain]) stats[domain] = { count: 0, hits: 0, subject: truncateSubject(subject) };

    stats[domain].count += 1;
    if (matchesAnyHint(subject, hints)) stats[domain].hits += 1;
    scanned += 1;
  }

  if (scanned === 0) {
    return [{ at, survey: `${survey}: ${labelName}`, bucket: 'サマリ', key: '該当なし', count: 0, share: '', sampleSubject: '', note: 'ラベルが空か、検索で引けませんでした' }];
  }

  const rows: Row[] = [];
  const domains = Object.keys(stats).sort((a, b) => stats[b].count - stats[a].count);
  let totalHits = 0;

  for (const domain of domains) {
    const stat = stats[domain];
    totalHits += stat.hits;
    rows.push({
      at,
      survey: `${survey}: ${labelName}`,
      bucket: '送信元ドメイン',
      key: domain,
      count: stat.count,
      share: percent(stat.count, scanned),
      sampleSubject: stat.subject,
      note: stat.hits > 0 ? `目安の件名に一致 ${stat.hits} 件 (${percent(stat.hits, stat.count)})` : '',
    });
  }

  rows.unshift({
    at,
    survey: `${survey}: ${labelName}`,
    bucket: 'サマリ',
    key: `走査 ${scanned} スレッド / ドメイン ${domains.length} 種`,
    count: scanned,
    share: percent(totalHits, scanned),
    sampleSubject: '',
    note: `目安の件名に一致したのは ${totalHits} 件。高いほど別ラベルへ分ける必要がある`,
  });
  return rows;
}

/**
 * Job/Applied の自動判定がどこまで効くかを測る。
 *
 * 一番強いシグナルは「スレッドに自分の送信メールが含まれるか」。
 * 求人アラートは一方通行なので、これで応募済みを切り分けられる。
 * ただし応募がプラットフォーム内で完結していると自分の送信は現れないため、
 * 件名パターンによる判定率も併せて出す。
 */
function surveyAppliedDetection(startedAt: number): Row[] {
  const me = Session.getActiveUser().getEmail().toLowerCase();
  const at = new Date();

  let scanned = 0;
  let byReply = 0;
  let bySubject = 0;
  let byEither = 0;

  for (const labelName of SAMPLING_TARGETS.JOB_LABELS) {
    for (const thread of searchLabel(labelName)) {
      if (Date.now() - startedAt > CONFIG.MAX_RUNTIME_MS) break;

      const messages = thread.getMessages();
      if (messages.length === 0) continue;

      const replied = messages.some((message) => extractAddress(message.getFrom()) === me);
      const hinted = matchesAnyHint(messages[0].getSubject() || '', APPLIED_HINTS);

      scanned += 1;
      if (replied) byReply += 1;
      if (hinted) bySubject += 1;
      if (replied || hinted) byEither += 1;
    }
  }

  if (scanned === 0) {
    return [{ at, survey: 'Job/Applied の判定率', bucket: 'サマリ', key: '該当なし', count: 0, share: '', sampleSubject: '', note: '' }];
  }

  return [
    { at, survey: 'Job/Applied の判定率', bucket: '判定', key: 'スレッドに自分の送信あり', count: byReply, share: percent(byReply, scanned), sampleSubject: '', note: '最も確度が高いシグナル' },
    { at, survey: 'Job/Applied の判定率', bucket: '判定', key: '件名パターン一致', count: bySubject, share: percent(bySubject, scanned), sampleSubject: '', note: 'プラットフォーム内で応募が完結する場合の受け皿' },
    { at, survey: 'Job/Applied の判定率', bucket: '判定', key: 'どちらか一致', count: byEither, share: percent(byEither, scanned), sampleSubject: '', note: '実際の Job/Applied 判定はこの組み合わせで行う' },
    { at, survey: 'Job/Applied の判定率', bucket: 'サマリ', key: '走査スレッド数', count: scanned, share: '', sampleSubject: '', note: `1 ラベルあたり上限 ${CONFIG.SAMPLE_LIMIT} スレッド` },
  ];
}

function searchLabel(labelName: string): GoogleAppsScript.Gmail.GmailThread[] {
  return GmailApp.search(`label:"${labelName}"`, 0, CONFIG.SAMPLE_LIMIT);
}

function matchesAnyHint(subject: string, hints: string[]): boolean {
  const lowered = (subject || '').toLowerCase();
  return hints.some((hint) => lowered.indexOf(hint.toLowerCase()) >= 0);
}

function percent(part: number, whole: number): string {
  if (whole === 0) return '';
  return `${Math.round((part / whole) * 1000) / 10}%`;
}
