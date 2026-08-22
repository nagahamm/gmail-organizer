/**
 * ラベル体系の移行。
 *
 * 移行計画もシート側を正にする。コードに現行ラベル名を書かない。
 * `seedMigrationPlan()` が現行ラベルから行を起こし、新ラベル列は人が埋める。
 *
 * 4,920 通規模になるため 6 分制限を跨ぐ。カーソルを保存して分割実行する。
 */

const MIGRATION_CURSOR_KEY = 'MIGRATION_CURSOR';
const MIGRATION_PAGE_SIZE = 100;

interface MigrationCursor {
  rowIndex: number;
  /** その行の何ステップ目まで終わったか。0 = 統合、1 = 拠点付与。 */
  stepIndex: number;
  start: number;
}

/** 1 行を実行するための手順。改名は 1 回で終わるので含めない。 */
interface MigrationStep {
  /** 対象スレッドを引くラベル。 */
  source: string;
  /** 付与するラベル。 */
  applied: string;
}

/** labels シートの現行ラベルから移行計画の行を起こす。新ラベル列は空のまま。 */
function seedMigrationPlan(): void {
  const known = existingKeys(SHEET_NAMES.MIGRATION, 'current');
  const rows: Row[] = [];

  for (const label of readRows(SHEET_NAMES.LABELS)) {
    const current = String(label['fullPath'] || '').trim();
    if (current === '' || known[current]) continue;

    rows.push({
      enabled: false,
      current,
      messageCount: Number(label['messageCount']) || 0,
      target: '',
      location: '',
      operation: 'skip',
      state: '',
      ranAt: '',
      memo: '',
    });
  }

  appendRows(SHEET_NAMES.MIGRATION, rows);
  activeBook().toast(
    `移行計画に ${rows.length} 行を追加しました。docs/label-migration.md を見ながら新ラベル列を埋めてください。`,
    'gmail-organizer',
    15
  );
}

function runMigration(): void {
  const startedAt = Date.now();
  const runId = newRunId();
  const dryRun = isDryRun();
  const plan = orderMigrationPlan(
    readRows(SHEET_NAMES.MIGRATION).filter((row) => row['enabled'] === true)
  );
  // ドライランは毎回 plan の先頭から独立して検証するだけにする。中断してもカーソルを
  // 保存・参照しない。本適用のカーソルと共有すると、ドライランの中断が本適用の
  // 開始位置を狂わせ、その前段の行が実行されないまま静かにスキップされてしまう。
  const cursor = dryRun ? { rowIndex: 0, stepIndex: 0, start: 0 } : readMigrationCursor();
  const entries: LogEntry[] = [];

  // クォータ超過など想定外の例外で抜けた場合でも、ここまでの進捗を失わないための現在地。
  let index = cursor.rowIndex;
  let step = 0;
  let start = 0;

  try {
    for (; index < plan.length; index += 1) {
      const row = plan[index];
      const operation = String(row['operation'] || 'skip').trim() as MigrationOp;
      const current = String(row['current'] || '').trim();
      const target = String(row['target'] || '').trim();
      const location = String(row['location'] || '').trim();

      if (operation === 'skip' || current === '') continue;

      // この行の途中から再開したかどうか。改名を二度実行しないための判定。
      const resuming = index === cursor.rowIndex && (cursor.stepIndex > 0 || cursor.start > 0);
      let renameError = '';
      if (operation === 'rename' && target !== '' && !resuming) {
        const entry = renameLabel(current, target, dryRun);
        entries.push(entry);
        if (!dryRun && entry.result.indexOf('error') === 0) renameError = entry.result;
      }

      // 改名が失敗していれば現行ラベルは古い名前のまま。以降のステップは
      // 新ラベル名ではなく現行ラベル名で検索しないと対象を一件も引けない。
      const renamed = operation === 'rename' && target !== '' && renameError === '';
      const resulting = renamed ? target : current;
      const steps = buildMigrationSteps(operation, current, resulting, target, location);

      for (step = resuming ? cursor.stepIndex : 0; step < steps.length; step += 1) {
        start = step === cursor.stepIndex && resuming ? cursor.start : 0;

        for (;;) {
          if (outOfTime(startedAt)) {
            if (!dryRun) writeMigrationCursor({ rowIndex: index, stepIndex: step, start });
            writeLog(runId, entries);
            console.log(`runMigration: 中断。${index + 1}/${plan.length} 行目のステップ ${step + 1}`);
            return;
          }

          const query = `label:"${sanitizeQueryValue(steps[step].source)}" -label:"${sanitizeQueryValue(steps[step].applied)}"`;
          const threads = GmailApp.search(query, start, MIGRATION_PAGE_SIZE);
          if (threads.length === 0) break;

          for (const thread of threads) entries.push(addLabelToThread(thread, steps[step].applied, dryRun));

          // 本適用も含め常に位置を進める。Gmail の検索インデックスは同一実行内で
          // 直前に付与したラベルを即座には反映しないため、`-label:"付与先"` の除外に
          // 頼って同じ位置を読み直すと、同じページを繰り返し処理するだけで対象全体に
          // 到達できない。除外は日をまたいだ再開でインデックスが追いついてから効く。
          start += threads.length;
          if (threads.length < MIGRATION_PAGE_SIZE) break;
        }
      }

      if (!dryRun) {
        updateCells(SHEET_NAMES.MIGRATION, [
          { rowNumber: Number(row['_rowNumber']), key: 'state', value: renameError || '完了' },
          { rowNumber: Number(row['_rowNumber']), key: 'ranAt', value: new Date() },
        ]);
      }
    }

    if (!dryRun) clearMigrationCursor();
    writeLog(runId, entries);
    console.log(`runMigration: 完了。${plan.length} 行を処理`);
  } catch (error) {
    // クォータ超過や GAS のハード制限など、outOfTime() では検知できない中断。
    // 次回実行が先頭からやり直しにならないよう、ここまでの進捗を保存してから再送出する。
    if (!dryRun) writeMigrationCursor({ rowIndex: index, stepIndex: step, start });
    writeLog(runId, entries);
    console.log(
      `runMigration: 例外で中断。${index + 1}/${plan.length} 行目のステップ ${step + 1}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
}

/**
 * 実行順を揃える。鍵は 2 つ。
 *
 * 1. 改名が統合より先。統合は getOrCreateLabel() で新ラベルを作ってしまうため、
 *    同じ新ラベルを指す改名が後に回ると Gmail が同名ラベルの重複を拒み、
 *    改名だけが落ちて現行ラベルが日本語名のまま取り残される。
 * 2. 改名の中では新ラベルの階層が浅い順。`Finance/Accounts/Deposits` を先に作ると、
 *    Gmail が親の `Finance/Accounts` を暗黙に作る場合に、
 *    本来そこへ改名するはずの `ファイナンス/Accounts` が衝突で落ちる。
 *    暗黙生成の有無は確認できていないので、どちらでも正しい順にしておく。
 *
 * シートの行順は seedMigrationPlan() が Gmail のラベル一覧順で起こすので、
 * 人が並べ替えられる前提には頼れない。ここで揃える。
 *
 * 再開カーソルは plan への添字なので、並べ替えは決定的である必要がある。
 * 鍵は operation と 新ラベル だけで、実行中に書き換わる 状態 / 実行日 は順序に影響しない。
 */
function orderMigrationPlan(plan: Row[]): Row[] {
  const isRename = (row: Row): number =>
    String(row['operation'] || '').trim() === 'rename' ? 0 : 1;

  /** 新ラベルの階層の深さ。統合行は改名の後ろに固まるので 0 で構わない。 */
  const depth = (row: Row): number => {
    if (isRename(row) !== 0) return 0;
    return String(row['target'] || '').trim().split('/').length;
  };

  return plan
    .slice()
    .sort((left, right) => isRename(left) - isRename(right) || depth(left) - depth(right));
}

/**
 * ページングが要る手順だけを並べる。
 * 統合が先、拠点付与が後。拠点は改名後のラベルに対して付ける。
 */
function buildMigrationSteps(
  operation: MigrationOp,
  current: string,
  resulting: string,
  target: string,
  location: string
): MigrationStep[] {
  const steps: MigrationStep[] = [];
  if (operation === 'merge' && target !== '') steps.push({ source: current, applied: target });
  if (location !== '') steps.push({ source: resulting, applied: location });
  return steps;
}

/** 移行の再開位置を捨てて最初からやり直す。 */
function resetMigration(): void {
  clearMigrationCursor();
  console.log('runMigration の再開位置を消しました');
}

/**
 * ラベルを改名する。
 * Gmail の改名はメールの割り当てを保持するので、1:1 の対応はこれで無風に移せる。
 */
function renameLabel(current: string, target: string, dryRun: boolean): LogEntry {
  const entry: LogEntry = {
    messageId: '',
    from: '',
    listId: '',
    subject: '',
    ruleId: 'migration',
    appliedLabel: target,
    action: `rename:${current} → ${target}`,
    result: dryRun ? 'dry_run' : 'applied',
  };

  if (dryRun || target === '') return entry;

  try {
    const label = findGmailLabel(current);
    if (!label || !label.id) {
      entry.result = `error: ラベル "${current}" が見つかりません`;
      return entry;
    }
    Gmail.Users!.Labels!.patch({ name: target }, 'me', label.id);
    // 改名後の名前でキャッシュを更新する。同じ実行内で参照されても食い違わないように。
    label.name = target;
  } catch (error) {
    entry.result = `error: ${error instanceof Error ? error.message : String(error)}`;
  }
  return entry;
}

/** ラベル一覧のキャッシュ。改名のたびに一覧を取り直さないため。 */
let gmailLabelCache: GoogleAppsScript.Gmail.Schema.Label[] | null = null;

function findGmailLabel(name: string): GoogleAppsScript.Gmail.Schema.Label | null {
  if (!gmailLabelCache) gmailLabelCache = Gmail.Users!.Labels!.list('me').labels || [];
  const found = gmailLabelCache.filter((item) => item.name === name);
  return found.length > 0 ? found[0] : null;
}

function addLabelToThread(
  thread: GoogleAppsScript.Gmail.GmailThread,
  labelName: string,
  dryRun: boolean
): LogEntry {
  const head = thread.getMessages()[0];

  const entry: LogEntry = {
    messageId: head ? head.getId() : thread.getId(),
    from: head ? extractAddress(head.getFrom()) : '',
    listId: '',
    subject: head ? head.getSubject() : thread.getFirstMessageSubject(),
    ruleId: 'migration',
    appliedLabel: labelName,
    action: `label:${labelName}`,
    result: dryRun ? 'dry_run' : 'applied',
  };

  if (dryRun) return entry;

  try {
    getOrCreateLabel(labelName).addToThread(thread);
  } catch (error) {
    entry.result = `error: ${error instanceof Error ? error.message : String(error)}`;
  }
  return entry;
}

function readMigrationCursor(): MigrationCursor {
  const raw = PropertiesService.getScriptProperties().getProperty(MIGRATION_CURSOR_KEY);
  if (!raw) return { rowIndex: 0, stepIndex: 0, start: 0 };
  try {
    const parsed = JSON.parse(raw) as MigrationCursor;
    return {
      rowIndex: Number(parsed.rowIndex) || 0,
      stepIndex: Number(parsed.stepIndex) || 0,
      start: Number(parsed.start) || 0,
    };
  } catch (error) {
    return { rowIndex: 0, stepIndex: 0, start: 0 };
  }
}

function writeMigrationCursor(cursor: MigrationCursor): void {
  PropertiesService.getScriptProperties().setProperty(MIGRATION_CURSOR_KEY, JSON.stringify(cursor));
}

function clearMigrationCursor(): void {
  PropertiesService.getScriptProperties().deleteProperty(MIGRATION_CURSOR_KEY);
}
