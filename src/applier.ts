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

/**
 * 張り替えの再開位置。月次の遡及とは別に持つ。
 * 共有すると、張り替えの中断が月次の開始位置を狂わせ、
 * その手前のルールが一度も適用されないまま静かに飛ばされる。
 */
const RELABEL_CURSOR_KEY = 'RELABEL_CURSOR';

/** 1 ルールあたり 1 回の検索で取るスレッド数。 */
const APPLY_PAGE_SIZE = 100;

/** その日どれだけ処理したか。遡及と張り替えで共有する。 */
const DAILY_USAGE_KEY = 'RETRO_DAILY_USAGE';

interface RetroCursor {
  ruleIndex: number;
  start: number;
}

/** 日次の使用量。`day` が変われば数え直す。 */
interface DailyUsage {
  /** スクリプトのタイムゾーンでの yyyy-MM-dd。 */
  day: string;
  threads: number;
}

/**
 * 使用量を進める。日が変わっていればその日のぶんだけにする。
 *
 * GAS API に触れないので `npm test` で検証できる。
 */
function rollDailyUsage(usage: DailyUsage, today: string, processed: number): DailyUsage {
  const carried = usage.day === today ? usage.threads : 0;
  return { day: today, threads: carried + processed };
}

/**
 * 今日ぶんの予算が残っているか。
 *
 * 上限は Gmail アカウント単位で効くので、遡及と張り替えで同じ数え場所を使う。
 * 分けて数えると合計で上限を超える。
 */
function hasDailyBudget(usage: DailyUsage, today: string, budget: number): boolean {
  if (budget <= 0) return true;
  if (usage.day !== today) return true;
  return usage.threads < budget;
}

/** 1 ページ読んだあと、次にどこから読むか。 */
interface PageStep {
  /** このルールは読み終わったか。 */
  done: boolean;
  /** 次の検索の開始位置。 */
  start: number;
}

/**
 * ページ送りの判断。GAS の API に触れないので `npm test` で検証できる。
 *
 * Gmail の検索インデックスは、直前に付けたラベルを反映することもしないこともある。
 * どちらでも進めるように、**新しいスレッドが取れたかどうか**で決める。
 *
 * - 取れた: 除外条件で結果が縮んだ可能性がある。位置を進めずに読み直す
 *   (進めると、縮んだぶんを飛び越して残りに一生到達しない)
 * - 取れなかった: その窓は読み尽くしている。次の窓へ進む
 *   (読み直しても同じページが返るだけで前へ進まない)
 *
 * 毎回どちらかが起きるので、有限のメールボックスに対して必ず止まる。
 */
function planNextPage(start: number, pageLength: number, fresh: number): PageStep {
  if (pageLength === 0) return { done: true, start: start };
  if (fresh > 0) return { done: false, start: start };
  return { done: pageLength < APPLY_PAGE_SIZE, start: start + pageLength };
}

/** 新着メールへの適用。時間主導トリガーから 15 分おきに呼ぶ。 */
function applyToNewMail(startedAt?: number): void {
  const processed = applyRules('newer_than:2d', false, budgetStart(startedAt));
  console.log(`applyToNewMail: ${processed} スレッドを処理しました`);
}

/**
 * 直近 1 年への遡及適用。
 * 6 分で終わらないので、続きの位置を保存して分割実行する。
 */
function applyRetroactive(): void {
  const now = new Date();
  const rules = loadRules().filter((rule) => isRuleApplicable(rule, now, true));
  runRetroactive(rules, RETRO_CURSOR_KEY, 'applyRetroactive');
}

/**
 * 行き先を変えた行だけを、保護を外して過去メールへ流す。
 *
 * `張り替え` に印の付いた行を集め、`受信トレイ除外` と `既読化` を落とした
 * 複製に対して遡及する。**シートのセルは書き換えない**ので、実行後に
 * 元へ戻す手順が要らない (docs/constraints.md 設計上の制約 3)。
 *
 * 印は消さない。二度目は `-label:` の除外で 0 件になるため再実行は無害。
 */
function applyRelabel(): void {
  const now = new Date();
  const rules = loadRules()
    .filter((rule) => rule.relabel && isRuleApplicable(rule, now, true))
    .map(relaxProtection);

  if (rules.length === 0) {
    const message = '「張り替え」に印の付いた行がありません。';
    console.log(`applyRelabel: ${message}`);
    activeBook().toast(message, 'gmail-organizer', 10);
    return;
  }

  runRetroactive(rules, RELABEL_CURSOR_KEY, 'applyRelabel');
}

/**
 * 遡及の共通ループ。渡されたルールを順に、対象期間ぶん適用する。
 *
 * 6 分の実行制限で終わらないので、中断したら再開位置を `cursorKey` に保存する。
 * 呼び出し元ごとに鍵を分けるため、キーは引数で受け取る。
 */
function runRetroactive(rules: Rule[], cursorKey: string, name: string, since?: number): void {
  const startedAt = budgetStart(since);
  const runId = newRunId();
  const dryRun = isDryRun();
  const windowQuery = readConfig('RETRO_QUERY_WINDOW', CONFIG.RETRO_QUERY_WINDOW);
  const budget = readDailyBudget();
  const today = todayKey();
  let usage = readDailyUsage();
  // ドライランは毎回先頭から独立して検証する。中断してもカーソルを保存・参照しない。
  // 本適用のカーソルと共有すると、ドライランの中断が本適用の開始位置を狂わせ、
  // その前段のルールが一度も適用されないまま静かにスキップされてしまう。
  const cursor = dryRun ? { ruleIndex: 0, start: 0 } : readCursor(cursorKey);
  const entries: LogEntry[] = [];
  let processed = 0;

  for (let index = cursor.ruleIndex; index < rules.length; index += 1) {
    const rule = rules[index];
    let start = index === cursor.ruleIndex ? cursor.start : 0;
    // 累計マッチ数はルール単位で数える。通算の processed を渡すと後ろのルールほど水増しされる。
    let matchedByRule = 0;
    // このルールで処理済みのスレッド。同じ位置を読み直しても二重に適用しないため。
    const seen: Record<string, boolean> = {};

    for (;;) {
      // ドライランは日次予算を消費しない。ラベルを変えず log に書くだけの検証で、
      // 本適用ぶんの枠をここで削ると、確認したあとに流せなくなる。
      const spent = !dryRun && !hasDailyBudget(usage, today, budget);
      if (outOfTime(startedAt) || spent) {
        if (!dryRun) {
          writeCursor(cursorKey, { ruleIndex: index, start });
          writeDailyUsage(usage);
        }
        writeLog(runId, entries);
        const why = spent ? `今日の上限 ${budget} スレッドに達した` : '時間切れ';
        console.log(
          `${name}: 中断 (${why})。ルール ${index + 1}/${rules.length}、${processed} スレッド処理`
        );
        return;
      }

      const threads = GmailApp.search(buildRuleQuery(rule, windowQuery), start, APPLY_PAGE_SIZE);

      let fresh = 0;
      for (const thread of threads) {
        const id = thread.getId();
        if (seen[id]) continue;
        seen[id] = true;
        fresh += 1;
        entries.push(applyToThread(thread, rule, dryRun));
      }
      processed += fresh;
      matchedByRule += fresh;
      if (!dryRun) usage = rollDailyUsage(usage, today, fresh);

      const step = planNextPage(start, threads.length, fresh);
      start = step.start;
      if (step.done) break;
    }

    if (!dryRun) touchRule(rule, matchedByRule);
  }

  if (!dryRun) {
    clearCursor(cursorKey);
    writeDailyUsage(usage);
  }
  writeLog(runId, entries);
  console.log(`${name}: 完了。${processed} スレッド処理`);
}

/**
 * 中断した遡及・張り替えの続きを流す。15 分ごとのジョブから呼ぶ。
 *
 * **再開位置が残っているときだけ動く。** 無ければ何もしない。
 * これを守らないと、15 分ごとに全期間の遡及が起動して日次クォータを一息で使い切る。
 *
 * ドライランはカーソルを保存しないので、ここには乗らない。ドライランは人が結果を
 * 見るための実行であって、無人で進めるものではない。
 *
 * 1 回の実行では片方だけ進める。張り替えを先にするのは、人が印を付けて
 * 明示的に始めたものだから。月次の遡及は待てる。
 */
function continueRetroactive(startedAt?: number): void {
  const since = budgetStart(startedAt);

  // 前の 3 ステップで予算を使い切っていることは珍しくない。ルールを読む前に降りる。
  if (outOfTime(since)) return;
  // 今日のぶんが尽きていれば、シートを読むだけ無駄になる。
  if (!hasDailyBudget(readDailyUsage(), todayKey(), readDailyBudget())) return;

  const now = new Date();

  if (hasCursor(RELABEL_CURSOR_KEY)) {
    const rules = loadRules()
      .filter((rule) => rule.relabel && isRuleApplicable(rule, now, true))
      .map(relaxProtection);
    if (rules.length > 0) {
      runRetroactive(rules, RELABEL_CURSOR_KEY, 'continueRelabel', since);
      return;
    }
    // 印が外された。続きを流す先が無いので位置を捨てる。
    clearCursor(RELABEL_CURSOR_KEY);
  }

  if (!hasCursor(RETRO_CURSOR_KEY)) return;
  const rules = loadRules().filter((rule) => isRuleApplicable(rule, now, true));
  runRetroactive(rules, RETRO_CURSOR_KEY, 'continueRetroactive', since);
}

/** 遡及と張り替えの再開位置を捨てて、どちらも最初からやり直す。 */
function resetRetroactive(): void {
  clearCursor(RETRO_CURSOR_KEY);
  clearCursor(RELABEL_CURSOR_KEY);
  console.log('遡及適用と張り替えの再開位置を消しました');
}

/** シートの有効なルールを評価して適用する。戻り値は処理したスレッド数。 */
function applyRules(windowQuery: string, retroactive: boolean, startedAt?: number): number {
  const now = new Date();
  const rules = loadRules().filter((rule) => isRuleApplicable(rule, now, retroactive));
  return runRules(rules, windowQuery, budgetStart(startedAt));
}

/**
 * 保持期間を過ぎたメールを受信トレイから外す。
 *
 * 「記録は残したいが毎回開く必要はない」ものを既読にして残す運用にすると、
 * そのままでは受信トレイが埋まっていく。日数を設定したルールだけ掃除する。
 *
 * 週次で回す。`older_than` の粒度が日なので、15 分ごとに引く意味がない。
 * ログの退避と同じ「週次のお掃除」に並べる。
 */
function archiveExpiredInbox(startedAt?: number): number {
  const since = budgetStart(startedAt);
  const runId = newRunId();
  const dryRun = isDryRun();
  const entries: LogEntry[] = [];

  for (const rule of loadRules()) {
    if (outOfTime(since)) {
      console.warn('archiveExpiredInbox: 時間切れのため残りのルールを飛ばしました');
      break;
    }

    const query = buildRetentionQuery(rule);
    if (query === '') continue;

    const threads = GmailApp.search(query, 0, CONFIG.SEARCH_PAGE_SIZE);
    for (const thread of threads) entries.push(archiveExpiredThread(thread, rule, dryRun));
  }

  writeLog(runId, entries);
  return entries.length;
}

/** 1 スレッドを受信トレイから外し、ログ 1 行分を返す。削除はしない。 */
function archiveExpiredThread(
  thread: GoogleAppsScript.Gmail.GmailThread,
  rule: Rule,
  dryRun: boolean
): LogEntry {
  const head = thread.getMessages()[0];

  const entry: LogEntry = {
    messageId: head ? head.getId() : thread.getId(),
    from: head ? extractAddress(head.getFrom()) : '',
    listId: '',
    subject: head ? head.getSubject() : thread.getFirstMessageSubject(),
    ruleId: rule.ruleId || String(rule.rowNumber),
    appliedLabel: rule.label,
    action: `受信トレイ除外 (保持 ${rule.inboxDays} 日を経過)`,
    result: dryRun ? 'dry_run' : 'applied',
  };

  if (dryRun) return entry;

  try {
    thread.moveToArchive();
  } catch (error) {
    entry.result = `error: ${error instanceof Error ? error.message : String(error)}`;
  }
  return entry;
}

/**
 * 渡されたルールだけを評価して適用する。
 * 承認された提案をその場で遡及適用するときにも使う。
 */
function runRules(rules: Rule[], windowQuery: string, startedAt?: number): number {
  const since = budgetStart(startedAt);
  const runId = newRunId();
  const dryRun = isDryRun();

  const entries: LogEntry[] = [];
  let processed = 0;

  for (const rule of rules) {
    if (outOfTime(since)) {
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

/**
 * ラベルを引く。無ければ祖先を浅い順に作ってから葉を作る。
 *
 * Gmail は名前の `/` で階層表示するが、親セグメント自体が実在するラベルでないと
 * 入れ子として扱わず、`/` を含んだだけの平坦なラベルが並ぶ。葉だけを作ると
 * ensureParentLabels() で後追い修復するまでその状態が残るので、作る側で閉じる。
 */
function getOrCreateLabel(name: string): GoogleAppsScript.Gmail.GmailLabel {
  if (labelCache[name]) return labelCache[name];

  let label = GmailApp.getUserLabelByName(name);
  if (!label) {
    // 先頭が `/` の場合は親が空になるので cut > 0 で弾く。
    const cut = name.lastIndexOf('/');
    if (cut > 0) getOrCreateLabel(name.slice(0, cut));
    label = GmailApp.createLabel(name);
  }

  labelCache[name] = label;
  return label;
}

/**
 * 祖先ラベルを実体として作る。
 *
 * Gmail はラベル名の `/` で階層表示するが、親セグメント自体が実在するラベルで
 * ないとサイドバーで展開可能な入れ子として扱わず、`/` を含んだだけの平坦なラベルが並ぶ。
 *
 * 新しく作られる葉は getOrCreateLabel() が親ごと作るので、こちらは
 * **すでに平坦に作られてしまった既存ラベル**を救うための後追い修復。
 */
function ensureParentLabels(): void {
  const existing: Record<string, boolean> = {};
  for (const label of GmailApp.getUserLabels()) existing[label.getName()] = true;

  const missing: Record<string, boolean> = {};
  for (const name of Object.keys(existing)) {
    const segments = name.split('/');
    for (let depth = 1; depth < segments.length; depth += 1) {
      const ancestor = segments.slice(0, depth).join('/');
      if (!existing[ancestor]) missing[ancestor] = true;
    }
  }

  // 浅い順に作る。作成は getOrCreateLabel() に寄せてラベル作成の経路を 1 本に保つ。
  const created = Object.keys(missing).sort();
  for (const name of created) getOrCreateLabel(name);

  console.log(`ensureParentLabels: ${created.length}件の親ラベルを作成しました (${created.join(', ')})`);
  activeBook().toast(
    created.length > 0
      ? `親ラベルを${created.length}件作成しました: ${created.join(', ')}`
      : '不足している親ラベルはありませんでした。',
    'gmail-organizer',
    15
  );
}

/** ルールの最終マッチ日と累計マッチ数を更新する。死んだルールを見つけるため。 */
function touchRule(rule: Rule, matched: number): void {
  if (matched === 0) return;
  updateCells(SHEET_NAMES.RULES, [
    { rowNumber: rule.rowNumber, key: 'lastMatchedAt', value: new Date() },
    { rowNumber: rule.rowNumber, key: 'matchCount', value: rule.matchCount + matched },
  ]);
}

function readCursor(key: string): RetroCursor {
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return { ruleIndex: 0, start: 0 };
  try {
    const parsed = JSON.parse(raw) as RetroCursor;
    return { ruleIndex: Number(parsed.ruleIndex) || 0, start: Number(parsed.start) || 0 };
  } catch (error) {
    return { ruleIndex: 0, start: 0 };
  }
}

function writeCursor(key: string, cursor: RetroCursor): void {
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(cursor));
}

function clearCursor(key: string): void {
  PropertiesService.getScriptProperties().deleteProperty(key);
}

function hasCursor(key: string): boolean {
  return PropertiesService.getScriptProperties().getProperty(key) !== null;
}

/** スクリプトのタイムゾーンでの今日。日付が変われば使用量を数え直す境目。 */
function todayKey(): string {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function readDailyBudget(): number {
  const raw = readConfig('DAILY_THREAD_BUDGET', String(CONFIG.DAILY_THREAD_BUDGET));
  const value = Number(raw);
  // 空欄や書き損じで 0 になると上限なしに化ける。既定へ落とす。
  return isNaN(value) || value <= 0 ? CONFIG.DAILY_THREAD_BUDGET : value;
}

function readDailyUsage(): DailyUsage {
  const raw = PropertiesService.getScriptProperties().getProperty(DAILY_USAGE_KEY);
  if (!raw) return { day: '', threads: 0 };
  try {
    const parsed = JSON.parse(raw) as DailyUsage;
    return { day: String(parsed.day || ''), threads: Number(parsed.threads) || 0 };
  } catch (error) {
    return { day: '', threads: 0 };
  }
}

function writeDailyUsage(usage: DailyUsage): void {
  PropertiesService.getScriptProperties().setProperty(DAILY_USAGE_KEY, JSON.stringify(usage));
}
