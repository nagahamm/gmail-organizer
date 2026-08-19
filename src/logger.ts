/**
 * 実行ログ。
 *
 * 何がなぜ振り分けられた / されなかったかを追えるようにする。
 * Gmail フィルタで一番困っていたのがこれが無いことだった。
 *
 * 件名は先頭 60 文字まで。本文は決して記録しない (CLAUDE.md の約束)。
 */

interface LogEntry {
  messageId: string;
  from: string;
  listId: string;
  subject: string;
  ruleId: string;
  appliedLabel: string;
  action: string;
  result: string;
}

/** 1 回の実行を識別する ID。ログを実行単位で絞り込めるようにする。 */
function newRunId(): string {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
}

function writeLog(runId: string, entries: LogEntry[]): void {
  if (entries.length === 0) return;
  const at = new Date();

  appendRows(
    SHEET_NAMES.LOG,
    entries.map((entry) => ({
      at,
      runId,
      messageId: entry.messageId,
      from: entry.from,
      listId: entry.listId,
      subject: truncateSubject(entry.subject),
      ruleId: entry.ruleId,
      appliedLabel: entry.appliedLabel,
      action: entry.action,
      result: entry.result,
    }))
  );
}
