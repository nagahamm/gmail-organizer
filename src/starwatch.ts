/**
 * スターを入力装置にした Job/Watching への昇格。
 *
 * 「関心が高い求人」は主観的な評価なので機械判定できない。かといって
 * 毎回ラベルを手で付けるのは面倒で、当初の課題 (登録が面倒) に逆戻りする。
 *
 * そこでスターをワンタップの入力として使う。スマホからでも押せて、
 * 状態はラベルとして残る。スターは外すので次回以降の走査対象から自然に消える。
 */

function promoteStarredJobs(): void {
  const sources = watchSourceLabels();
  if (sources.length === 0) {
    console.log(`promoteStarredJobs: ${CONFIG.WATCH_SOURCE_PREFIX} 配下のラベルがまだありません`);
    return;
  }

  const dryRun = isDryRun();
  const runId = newRunId();
  const query = `is:starred (${sources.map((name) => `label:"${name}"`).join(' OR ')})`;
  const threads = GmailApp.search(query, 0, CONFIG.SEARCH_PAGE_SIZE);

  const entries: LogEntry[] = [];
  for (const thread of threads) {
    entries.push(promoteThread(thread, dryRun));
  }

  writeLog(runId, entries);
  console.log(`promoteStarredJobs: ${threads.length} スレッドを ${CONFIG.WATCH_TARGET_LABEL} へ昇格`);
}

/**
 * 監視対象のラベル。
 *
 * Gmail の検索では `label:親` が子ラベルを含まないため、接頭辞で列挙する。
 * 他のラベルに付いたスターには触れない (既存のスター 451 件を守るため)。
 */
function watchSourceLabels(): string[] {
  return GmailApp.getUserLabels()
    .map((label) => label.getName())
    .filter((name) => name.indexOf(CONFIG.WATCH_SOURCE_PREFIX) === 0);
}

function promoteThread(thread: GoogleAppsScript.Gmail.GmailThread, dryRun: boolean): LogEntry {
  const head = thread.getMessages()[0];

  const entry: LogEntry = {
    messageId: head ? head.getId() : thread.getId(),
    from: head ? extractAddress(head.getFrom()) : '',
    listId: '',
    subject: head ? head.getSubject() : thread.getFirstMessageSubject(),
    ruleId: 'starwatch',
    appliedLabel: CONFIG.WATCH_TARGET_LABEL,
    action: `label:${CONFIG.WATCH_TARGET_LABEL}, 受信トレイへ戻す, スターを外す`,
    result: dryRun ? 'dry_run' : 'applied',
  };

  if (dryRun) return entry;

  try {
    getOrCreateLabel(CONFIG.WATCH_TARGET_LABEL).addToThread(thread);
    thread.moveToInbox();
    // スターを外すことで次回の走査対象から外れる。二重処理も防げる。
    thread.getMessages().forEach((message) => message.unstar());
  } catch (error) {
    entry.result = `error: ${error instanceof Error ? error.message : String(error)}`;
  }
  return entry;
}
