/**
 * ルールの適用。
 *
 * Gmail フィルタと違い、受信時以外にも走り、過去メールへ遡及でき、
 * 1 通ごとにログが残る。
 *
 * 破壊的操作なので、DRY_RUN の間はラベルを一切変更せず log に記録するだけ。
 */

/** 遡及実行の再開位置。6 分の実行制限を跨ぐために使う。 */
const RETRO_CURSOR_KEY = 'RETRO_CURSOR';

/** 1 ルールあたり 1 回の検索で取るスレッド数。 */
const APPLY_PAGE_SIZE = 100;

interface RetroCursor {
  ruleIndex: number;
  start: number;
}

/** 新着メールへの適用。時間主導トリガーから 15 分おきに呼ぶ。 */
function applyToNewMail(): void {
  const processed = applyRules('newer_than:2d', false);
  console.log(`applyToNewMail: ${processed} スレッドを処理しました`);
}

/**
 * 直近 1 年への遡及適用。
 * 6 分で終わらないので、続きの位置を保存して分割実行する。
 */
function applyRetroactive(): void {
  const startedAt = Date.now();
  const runId = newRunId();
  const now = new Date();
  const dryRun = isDryRun();
  const windowQuery = readConfig('RETRO_QUERY_WINDOW', CONFIG.RETRO_QUERY_WINDOW);

  const rules = loadRules().filter((rule) => isRuleApplicable(rule, now, true));
  const cursor = readCursor();
  const entries: LogEntry[] = [];
  let processed = 0;

  for (let index = cursor.ruleIndex; index < rules.length; index += 1) {
    const rule = rules[index];
    let start = index === cursor.ruleIndex ? cursor.start : 0;
    // 累計マッチ数はルール単位で数える。通算の processed を渡すと後ろのルールほど水増しされる。
    let matchedByRule = 0;

    for (;;) {
      if (Date.now() - startedAt > CONFIG.MAX_RUNTIME_MS) {
        writeCursor({ ruleIndex: index, start });
        writeLog(runId, entries);
        console.log(`applyRetroactive: 中断。ルール ${index + 1}/${rules.length}、${processed} スレッド処理`);
        return;
      }

      const threads = GmailApp.search(buildRuleQuery(rule, windowQuery), start, APPLY_PAGE_SIZE);
      if (threads.length === 0) break;

      for (const thread of threads) entries.push(applyToThread(thread, rule, dryRun));
      processed += threads.length;
      matchedByRule += threads.length;

      // ドライランではラベルが付かず検索結果が減らないので、次のページへ進める。
      // 本適用では対象が消えていくため同じ位置を読み直す。
      start = dryRun ? start + threads.length : start;
      if (threads.length < APPLY_PAGE_SIZE) break;
    }

    if (!dryRun) touchRule(rule, matchedByRule);
  }

  clearCursor();
  writeLog(runId, entries);
  console.log(`applyRetroactive: 完了。${processed} スレッド処理`);
}

/** 遡及実行の再開位置を捨てて最初からやり直す。 */
function resetRetroactive(): void {
  clearCursor();
  console.log('applyRetroactive の再開位置を消しました');
}

/** シートの有効なルールを評価して適用する。戻り値は処理したスレッド数。 */
function applyRules(windowQuery: string, retroactive: boolean): number {
  const now = new Date();
  const rules = loadRules().filter((rule) => isRuleApplicable(rule, now, retroactive));
  return runRules(rules, windowQuery);
}

/**
 * 渡されたルールだけを評価して適用する。
 * 承認された提案をその場で遡及適用するときにも使う。
 */
function runRules(rules: Rule[], windowQuery: string): number {
  const startedAt = Date.now();
  const runId = newRunId();
  const dryRun = isDryRun();

  const entries: LogEntry[] = [];
  let processed = 0;

  for (const rule of rules) {
    if (Date.now() - startedAt > CONFIG.MAX_RUNTIME_MS) {
      console.warn('runRules: 時間切れのため残りのルールを飛ばしました');
      break;
    }

    const threads = GmailApp.search(buildRuleQuery(rule, windowQuery), 0, CONFIG.SEARCH_PAGE_SIZE);
    if (threads.length === 0) continue;

    for (const thread of threads) entries.push(applyToThread(thread, rule, dryRun));
    processed += threads.length;
    if (!dryRun) touchRule(rule, threads.length);
  }

  writeLog(runId, entries);
  return processed;
}

/** 1 スレッドへルールを適用し、ログ 1 行分を返す。 */
function applyToThread(
  thread: GoogleAppsScript.Gmail.GmailThread,
  rule: Rule,
  dryRun: boolean
): LogEntry {
  const head = thread.getMessages()[0];
  const actions: string[] = [];

  const entry: LogEntry = {
    messageId: head ? head.getId() : thread.getId(),
    from: head ? extractAddress(head.getFrom()) : '',
    listId: '',
    subject: head ? head.getSubject() : thread.getFirstMessageSubject(),
    ruleId: rule.ruleId || String(rule.rowNumber),
    appliedLabel: [rule.label, rule.location].filter((name) => name !== '').join(' + '),
    action: '',
    result: dryRun ? 'dry_run' : 'applied',
  };

  if (rule.label) actions.push(`label:${rule.label}`);
  if (rule.location) actions.push(`label:${rule.location}`);
  if (rule.skipInbox) actions.push('受信トレイ除外');
  if (rule.markRead) actions.push('既読化');
  if (rule.star) actions.push('スター');
  // 迷惑メールにしない は受信時にしか意味がなく、既に届いたメールには適用できない。
  // 既存フィルタから取り込んだ設定を捨てないよう、記録だけ残す。
  if (rule.neverSpam) actions.push('迷惑メールにしない(記録のみ)');
  entry.action = actions.join(', ');

  // 受信トレイから外す / 既読にするルールは、既に別の種別ラベルが付いた
  // スレッドには適用しない。同じ送信元から取引と販促の両方が届く場合に、
  // 販促のルールが注文確認を静かに消してしまうのを防ぐ。
  if ((rule.skipInbox || rule.markRead) && hasOtherTypeLabel(thread, rule)) {
    entry.result = 'skipped: 既に分類済み';
    return entry;
  }

  if (dryRun) return entry;

  try {
    if (rule.label) getOrCreateLabel(rule.label).addToThread(thread);
    if (rule.location) getOrCreateLabel(rule.location).addToThread(thread);
    if (rule.skipInbox) thread.moveToArchive();
    if (rule.markRead) thread.markRead();
    if (rule.star && head) head.star();
  } catch (error) {
    entry.result = `error: ${error instanceof Error ? error.message : String(error)}`;
  }
  return entry;
}

/**
 * そのスレッドが既に別の種別ラベルを持っているか。
 *
 * 拠点ラベル (`@` で始まるもの) と、そのルール自身の付与先は数えない。
 * 1 通に `Promotions/Stores` と `@AU` の両方が付くのは正しい挙動なので、
 * 並行付与を壊さないようにする。
 *
 * `thread.getLabels()` は 1 スレッド 1 コールなので、破壊的なルールに限って呼ぶ。
 */
function hasOtherTypeLabel(thread: GoogleAppsScript.Gmail.GmailThread, rule: Rule): boolean {
  return thread.getLabels().some((label) => {
    const name = label.getName();
    if (name === rule.label || name === rule.location) return false;
    return name.charAt(0) !== '@';
  });
}

/** ラベルのキャッシュ。1 回の実行内で同じラベルを何度も引かないため。 */
const labelCache: Record<string, GoogleAppsScript.Gmail.GmailLabel> = {};

function getOrCreateLabel(name: string): GoogleAppsScript.Gmail.GmailLabel {
  if (labelCache[name]) return labelCache[name];
  const label = GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
  labelCache[name] = label;
  return label;
}

/** ルールの最終マッチ日と累計マッチ数を更新する。死んだルールを見つけるため。 */
function touchRule(rule: Rule, matched: number): void {
  if (matched === 0) return;
  updateCell(SHEET_NAMES.RULES, rule.rowNumber, 'lastMatchedAt', new Date());
  updateCell(SHEET_NAMES.RULES, rule.rowNumber, 'matchCount', rule.matchCount + matched);
}

function readCursor(): RetroCursor {
  const raw = PropertiesService.getScriptProperties().getProperty(RETRO_CURSOR_KEY);
  if (!raw) return { ruleIndex: 0, start: 0 };
  try {
    const parsed = JSON.parse(raw) as RetroCursor;
    return { ruleIndex: Number(parsed.ruleIndex) || 0, start: Number(parsed.start) || 0 };
  } catch (error) {
    return { ruleIndex: 0, start: 0 };
  }
}

function writeCursor(cursor: RetroCursor): void {
  PropertiesService.getScriptProperties().setProperty(RETRO_CURSOR_KEY, JSON.stringify(cursor));
}

function clearCursor(): void {
  PropertiesService.getScriptProperties().deleteProperty(RETRO_CURSOR_KEY);
}
