/**
 * Gmail の高度なサービス経由のヘルパ。
 *
 * GmailApp は任意のヘッダを露出しないため、List-Id の取得にはこちらが要る。
 * ただしヘッダ読みは 1 通 1 コールでクォータを食うので、
 * 振り分け本体では使わず Gmail 検索の `list:` 演算子に任せる (applier.ts)。
 * ここを使うのは調査系 (sampler.ts / digest) に限る。
 */

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

/** 割合を「12.3%」の形にする。母数 0 なら空文字。 */
function percent(part: number, whole: number): string {
  if (whole === 0) return '';
  return `${Math.round((part / whole) * 1000) / 10}%`;
}
