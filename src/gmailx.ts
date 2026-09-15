/**
 * Gmail の高度なサービス経由のヘルパ。
 *
 * GmailApp は任意のヘッダを露出しないため、List-Id の取得にはこちらが要る。
 * ただしヘッダ読みは 1 通 1 コールでクォータを食うので、
 * 振り分け本体では使わず Gmail 検索の `list:` 演算子に任せる (applier.ts)。
 * ここを使うのは調査系 (sampler.ts / digest) に限る。
 */

/**
 * GAS の Gmail 割り当て超過が例外メッセージに含む、既知の文言を検出する。
 *
 * GAS には「残り割り当てを事前に確認する」API がGmailの読み取り系には無い
 * (送信系だけ `MailApp.getRemainingDailyQuota()` がある)。実行中に超過するのは
 * 避けられないが、**既に超過している状態で実行を始めた場合**は、関数の先頭で
 * 安価な呼び出しを 1 回試すことで即座に検出できる (`assertGmailQuotaAvailable`)。
 * 深いところで初めて失敗して原因が分かりにくくなるのを防ぐ。
 *
 * GAS API に触れないので npm test で検証できる。
 */
function isGmailQuotaExceeded(message: string): boolean {
  return /service invoked too many times|quota|rate limit/i.test(message);
}

/**
 * Gmail 操作を多く行う関数の先頭で呼ぶ。安価な呼び出しを 1 回試し、
 * 既に割り当てを超えていればここで即座に、分かりやすいメッセージで失敗させる。
 */
function assertGmailQuotaAvailable(): void {
  try {
    GmailApp.getInboxUnreadCount();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isGmailQuotaExceeded(message)) {
      throw new Error(`Gmail APIの割り当てを超えています。時間を置いてから再実行してください: ${message}`);
    }
    throw error;
  }
}

/**
 * ラベル一覧。
 *
 * 高度な Gmail サービスの `list` は、該当が 0 件だと応答本文が空になり
 * **戻り値そのものが `null`** で返る。`listed.labels || []` では守れないので、
 * null になり得るという知識をここ 1 箇所に閉じ込める。
 */
function listGmailLabels(): GoogleAppsScript.Gmail.Schema.Label[] {
  const listed = Gmail.Users!.Labels!.list('me');
  return (listed && listed.labels) || [];
}

/**
 * フィルタ一覧。
 *
 * フィルタは真実の源から降格させて凍結する方針なので、0 件は想定内の状態。
 * そこで落ちないよう `listGmailLabels()` と同じく null を畳む。
 */
function listGmailFilters(): GoogleAppsScript.Gmail.Schema.Filter[] {
  const listed = Gmail.Users!.Settings!.Filters!.list('me');
  return (listed && listed.filter) || [];
}

/** メールの主要ヘッダをまとめて読む。 */
function messageHeaders(messageId: string, names: string[]): Record<string, string> {
  const message = Gmail.Users!.Messages!.get('me', messageId, {
    format: 'metadata',
    metadataHeaders: names,
  });

  const found: Record<string, string> = {};
  const headers = message.payload && message.payload.headers ? message.payload.headers : [];
  for (const header of headers) {
    if (header.name) found[header.name.toLowerCase()] = header.value || '';
  }
  return found;
}

/**
 * List-Id ヘッダから識別子だけを取り出す。
 * `Example News <news.example.com>` → `news.example.com`
 */
function normalizeListId(raw: string): string {
  if (!raw) return '';
  const bracketed = raw.match(/<([^>]+)>/);
  return (bracketed ? bracketed[1] : raw).trim().toLowerCase();
}

/** `Name <user@example.com>` からメールアドレスだけを取り出す。 */
function extractAddress(from: string): string {
  if (!from) return '';
  const bracketed = from.match(/<([^>]+)>/);
  return (bracketed ? bracketed[1] : from).trim().toLowerCase();
}

/**
 * `Name <user@example.com>` から表示名だけを取り出す。
 *
 * アドレスだけでは実体が分からない。`spmode.ne.jp` は NTT ドコモのドメインだが
 * 表示名は「ドコモスポーツくじ」で、実体は通信ではなく toto の販促だった。
 */
function extractDisplayName(from: string): string {
  if (!from) return '';
  const at = from.indexOf('<');
  if (at < 0) return '';
  const name = from.slice(0, at).trim().replace(/^"|"$/g, '');
  return normalizeDisplayName(name);
}

/**
 * 表示名の見た目を整える。
 *
 * - 全角の欧字・括弧・スペースを半角に揃える (NFKC)。`Uber Eats` や `freee` のような
 *   元から半角の会社名は対象になる文字が無いので、これだけでは変わらない
 * - 装飾の＜＞【】で囲われた部分はタグとして剥がす
 * - 「株式会社」「(株)」は法人格の表記ゆれなので落とす
 * - 半角英数字の直後に日本語が続く境界にスペースを入れる (`povo2.0運営事務局` →
 *   `povo2.0 運営事務局`)。逆向き (日本語の直後に英字) は対象にしない。
 *   `スタディサプリENGLISH` のような合成語をそのまま残すため
 *
 * 「SBI証券」を「SBI」にするような、ブランド名を短縮する判断はしない。
 * それは `senders.運営元` / `senders.サービス` が本来担う役割 (docs/constraints.md 5b)。
 */
function normalizeDisplayName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/^[<【]\s*/, '')
    .replace(/\s*[>】]$/, '')
    .replace(/株式会社|\(株\)/g, '')
    .replace(/([a-zA-Z0-9.])([\u3040-\u30ff\u4e00-\u9fff])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 送信元アドレスからドメインを取り出す。 */
function senderDomain(from: string): string {
  const address = extractAddress(from);
  const at = address.lastIndexOf('@');
  return at < 0 ? '' : address.slice(at + 1);
}

/** ログに残す件名。先頭 60 文字まで。本文は決して記録しない。 */
function truncateSubject(subject: string): string {
  const text = (subject || '').replace(/\s+/g, ' ').trim();
  return text.length <= CONFIG.SUBJECT_MAX ? text : `${text.slice(0, CONFIG.SUBJECT_MAX)}…`;
}

/** ラベル名を大項目・中項目・小項目に分解する。4 段以上は小項目にまとめる。 */
function splitLabelPath(name: string): { major: string; middle: string; minor: string } {
  const parts = name.split('/');
  return {
    major: parts[0] || '',
    middle: parts[1] || '',
    minor: parts.length > 2 ? parts.slice(2).join('/') : '',
  };
}

/**
 * 実行の予算を使い切ったか。
 *
 * 起点は「その関数が呼ばれた時刻」ではなく「実行が始まった時刻」。
 * 複数のステップを続けて回す入口では 1 つの startedAt を全ステップへ渡す。
 * 関数ごとに数え直すと、ステップ数だけ 6 分制限を超えられてしまう。
 */
function outOfTime(startedAt: number): boolean {
  return Date.now() - startedAt > CONFIG.MAX_RUNTIME_MS;
}

/**
 * 予算の起点を決める。
 *
 * 呼び出し元がステップを続けて回す場合はその開始時刻を渡す。
 * メニューやトリガーから直接呼ばれる場合は引数が無い (あるいはイベント
 * オブジェクトが渡る) ので、数値でなければ今から数え始める。
 */
function budgetStart(startedAt?: number): number {
  return typeof startedAt === 'number' ? startedAt : Date.now();
}

/** 割合を「12.3%」の形にする。母数 0 なら空文字。 */
function percent(part: number, whole: number): string {
  if (whole === 0) return '';
  return `${Math.round((part / whole) * 1000) / 10}%`;
}
