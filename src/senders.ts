/**
 * 送信元マスタ (メーリングリスト DB)。
 *
 * 送信元アドレスとラベルの対応だけでは「どの会社の、どのサービスからか」が
 * 分からない。1 つの会社が複数のアドレス・複数のサービスを使うのが普通で、
 * 同じリクルートでも じゃらん・ホットペッパービューティー・リクルートエージェントで
 * 行き先が変わる。運営元とサービスを分けて持たないと整理できない。
 *
 * `運営元` と `サービス` は機械では埋まらない。人と週次 AI が育てる列。
 */

/** 1 ページあたりの走査数。 */
const SENDER_PAGE_SIZE = 100;

interface SenderObservation {
  address: string;
  displayName: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  messageId: string;
}

/**
 * 受信メールを走査して送信元マスタを更新する。
 *
 * 既存の行は上書きせず、観測した値だけを更新する。
 * `運営元` / `サービス` / `備考` など人が育てた列には触れない。
 */
function refreshSenders(startedAt?: number): void {
  // 手動メニューと週次ダイジェストの両方から呼ばれるため、同時に走ると
  // 互いに「まだ追加されていない」古い known を見て同じ送信元を二重に
  // appendRows してしまう。ロックで直列化し、既に走っていれば諦めて次回に譲る。
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    console.warn('refreshSenders: 別の実行が進行中のため、今回はスキップします');
    return;
  }

  try {
    // 呼び出し元が別のステップと予算を分け合う場合は、その開始時刻を受け取る。
    const since = budgetStart(startedAt);
    const window = readConfig('SENDER_SCAN_WINDOW', CONFIG.SENDER_SCAN_WINDOW);
    const scan = scanSenders(window, since);
    const observed = scan.observed;

    const rows = readRows(SHEET_NAMES.SENDERS);
    const known: Record<string, Row> = {};
    for (const row of rows) {
      const address = String(row['address'] || '').trim().toLowerCase();
      if (address !== '') known[address] = row;
    }

    const added: Row[] = [];
    const updates: CellUpdate[] = [];
    let updated = 0;

    for (const address of Object.keys(observed)) {
      const seen = observed[address];
      const existing = known[address];

      if (!existing) {
        added.push(buildSenderRow(seen));
        continue;
      }
      for (const update of senderUpdates(existing, seen, scan.complete)) updates.push(update);
      updated += 1;
    }

    // 打ち切られた走査では「observed に無い」と「まだ見ていない」が区別できない。
    // 見ていないものを休眠と断定しない。
    if (scan.complete) {
      for (const update of dormantUpdates(rows, observed)) updates.push(update);
    }

    // 追記より先に流す。追記で行が増えても既存行の行番号は変わらないが、
    // 読み取り済みの行番号を使う以上、間に他の書き込みを挟まない方が追いやすい。
    updateCells(SHEET_NAMES.SENDERS, updates);
    appendRows(SHEET_NAMES.SENDERS, added);

    const note = scan.complete ? '' : ' (時間切れで途中まで。直近90日と休眠判定は据え置き)';
    console.log(`refreshSenders: 新規 ${added.length} 件 / 更新 ${updated} 件${note}`);
  } finally {
    lock.releaseLock();
  }
}

/** 走査の結果。`complete` が false なら観測は途中までしかない。 */
interface SenderScan {
  observed: Record<string, SenderObservation>;
  complete: boolean;
}

/** 走査して送信元ごとに集計する。6 分制限に収まるよう時間を見て打ち切る。 */
function scanSenders(window: string, startedAt: number): SenderScan {
  const observed: Record<string, SenderObservation> = {};
  let start = 0;

  for (;;) {
    const threads = GmailApp.search(window, start, SENDER_PAGE_SIZE);
    if (threads.length === 0) break;

    for (const thread of threads) {
      // 1 スレッドごとに getMessages() を呼ぶので 1 ページの処理時間が長い。
      // ページ単位で見ていると 1 ページぶん予算を超過する。
      if (outOfTime(startedAt)) {
        console.warn('scanSenders: 時間切れで打ち切りました');
        return { observed, complete: false };
      }

      const head = thread.getMessages()[0];
      if (!head) continue;

      const address = extractAddress(head.getFrom());
      if (address === '') continue;
      const at = new Date(head.getDate().getTime());

      if (!observed[address]) {
        observed[address] = {
          address,
          displayName: extractDisplayName(head.getFrom()),
          count: 0,
          firstSeen: at,
          lastSeen: at,
          messageId: head.getId(),
        };
      }
      const seen = observed[address];
      seen.count += 1;
      if (at < seen.firstSeen) seen.firstSeen = at;
      if (at > seen.lastSeen) seen.lastSeen = at;
    }

    start += threads.length;
    if (threads.length < SENDER_PAGE_SIZE) break;
  }
  return { observed, complete: true };
}

/**
 * 新しい送信元の行を組み立てる。
 * `List-Id` は新規のときだけ 1 通読む。メーリングリストならそのまま
 * `list_id` 種別のルールのパターンになる。
 */
function buildSenderRow(seen: SenderObservation): Row {
  return {
    address: seen.address,
    displayName: seen.displayName,
    operator: '',
    service: '',
    kind: '',
    listId: lookupListId(seen.messageId),
    recentCount: seen.count,
    firstSeen: seen.firstSeen,
    lastSeen: seen.lastSeen,
    state: 'active',
  };
}

/**
 * 観測できる列だけの更新指示を作る。人が育てた列には触れない。
 *
 * ここで書き込まないのは、送信元の数だけ API を呼ぶと 6 分制限に当たるため。
 * 呼び出し元が全件ぶんを集めて 1 回で流す。
 */
function senderUpdates(existing: Row, seen: SenderObservation, complete: boolean): CellUpdate[] {
  const rowNumber = Number(existing['_rowNumber']);
  const updates: CellUpdate[] = [];

  // 表示名は変わることがあるので観測するたびに最新へ更新する。
  if (seen.displayName !== '') {
    updates.push({ rowNumber, key: 'displayName', value: seen.displayName });
  }
  // 途中までの通数で上書きすると配信頻度の判断が狂う。前回の値を残す。
  if (complete) updates.push({ rowNumber, key: 'recentCount', value: seen.count });
  updates.push({ rowNumber, key: 'lastSeen', value: seen.lastSeen });
  updates.push({ rowNumber, key: 'state', value: 'active' });

  const firstSeen = existing['firstSeen'];
  if (!(firstSeen instanceof Date) || seen.firstSeen < firstSeen) {
    updates.push({ rowNumber, key: 'firstSeen', value: seen.firstSeen });
  }
  return updates;
}

/** しばらく届いていない送信元を dormant にする更新指示。解約済みの見落としを拾うため。 */
function dormantUpdates(rows: Row[], observed: Record<string, SenderObservation>): CellUpdate[] {
  const threshold = Date.now() - CONFIG.SENDER_DORMANT_DAYS * 24 * 60 * 60 * 1000;
  const updates: CellUpdate[] = [];

  for (const row of rows) {
    const address = String(row['address'] || '').trim().toLowerCase();
    if (address === '' || observed[address]) continue;
    if (String(row['state'] || '') !== 'active') continue;

    const lastSeen = row['lastSeen'];
    if (lastSeen instanceof Date && lastSeen.getTime() >= threshold) continue;

    updates.push({ rowNumber: Number(row['_rowNumber']), key: 'state', value: 'dormant' });
  }
  return updates;
}

/**
 * 運営元ごとの通数をまとめる。
 * 「リクルート系だけで 4 サービス、直近 90 日で 300 通」のような把握に使う。
 */
function summarizeByOperator(): Record<string, { services: number; count: number }> {
  const totals: Record<string, { services: number; count: number }> = {};

  for (const row of readRows(SHEET_NAMES.SENDERS)) {
    const operator = String(row['operator'] || '').trim();
    if (operator === '') continue;

    if (!totals[operator]) totals[operator] = { services: 0, count: 0 };
    totals[operator].services += 1;
    totals[operator].count += Number(row['recentCount']) || 0;
  }
  return totals;
}

/** 重複統合の計画。 */
interface SenderDedupPlan {
  merged: Row[];
  mergedCount: number;
  droppedCount: number;
}

/**
 * 同じ送信元アドレスが複数行に分かれている場合、1 行に統合する計画を立てる。
 *
 * `refreshSenders()` が同時に 2 回走ると、互いに古い「まだ追加されていない」
 * 状態を見て同じ送信元を二重に追記することがある (`LockService` で再発は防ぐ)。
 * 既に増えてしまった重複はこちらで統合する。
 *
 * GAS API に触れないので npm test で検証できる。
 */
function planSenderDedup(rows: Row[]): SenderDedupPlan {
  const order: string[] = [];
  const groups: Record<string, Row[]> = {};

  for (const row of rows) {
    const address = String(row['address'] || '').trim().toLowerCase();
    if (address === '') continue;
    if (!groups[address]) {
      groups[address] = [];
      order.push(address);
    }
    groups[address].push(row);
  }

  const merged: Row[] = [];
  let mergedCount = 0;
  let droppedCount = 0;

  for (const address of order) {
    const group = groups[address];
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    merged.push(mergeSenderRows(group));
    mergedCount += 1;
    droppedCount += group.length - 1;
  }

  return { merged, mergedCount, droppedCount };
}

/**
 * 同一アドレスの複数行を 1 行にまとめる。
 * 空欄は他の行の値で埋め、初回受信は最も早く・最終受信は最も遅く・
 * 直近90日は最大を採用する (走査ウィンドウが重なった二重観測を足し合わせて
 * 水増ししないため)。
 */
function mergeSenderRows(group: Row[]): Row {
  const merged: Row = { ...group[0] };

  for (const key of ['displayName', 'operator', 'service', 'kind', 'listId']) {
    if (String(merged[key] || '').trim() !== '') continue;
    for (const row of group.slice(1)) {
      const candidate = String(row[key] || '').trim();
      if (candidate !== '') {
        merged[key] = candidate;
        break;
      }
    }
  }

  const firstSeens = group.filter((row) => row['firstSeen'] instanceof Date).map((row) => row['firstSeen'] as Date);
  const lastSeens = group.filter((row) => row['lastSeen'] instanceof Date).map((row) => row['lastSeen'] as Date);
  if (firstSeens.length > 0) {
    merged['firstSeen'] = new Date(Math.min(...firstSeens.map((d) => d.getTime())));
  }
  if (lastSeens.length > 0) {
    merged['lastSeen'] = new Date(Math.max(...lastSeens.map((d) => d.getTime())));
  }

  merged['recentCount'] = Math.max(...group.map((row) => Number(row['recentCount']) || 0));
  if (group.some((row) => String(row['state']) === 'active')) merged['state'] = 'active';

  return merged;
}

/** 送信元の重複を実際に統合する。 */
function dedupeSenders(): void {
  const plan = planSenderDedup(readRows(SHEET_NAMES.SENDERS));
  if (plan.droppedCount === 0) {
    console.log('dedupeSenders: 重複しているアドレスはありませんでした');
    return;
  }
  replaceRows(SHEET_NAMES.SENDERS, plan.merged);
  console.log(`dedupeSenders: ${plan.mergedCount} 件のアドレスを統合し、${plan.droppedCount} 行を削除しました`);
}

/** 表示名 1 件ぶんの再正規化計画。 */
interface DisplayNameFix {
  rowNumber: number;
  before: string;
  after: string;
}

/**
 * 既存の表示名を、今の `normalizeDisplayName()` のルールで作り直す計画を立てる。
 *
 * `normalizeDisplayName()` はルールを追加・変更しても新しく観測した表示名にしか
 * 効かない。過去に取り込んだ表示名は古いルールのまま残るので、ここで遡って
 * 直す。変わらない行は計画に含めない。
 *
 * GAS API に触れないので npm test で検証できる。
 */
function planDisplayNameRenormalization(rows: Row[]): DisplayNameFix[] {
  const plan: DisplayNameFix[] = [];
  for (const row of rows) {
    const before = String(row['displayName'] || '');
    if (before === '') continue;
    const after = normalizeDisplayName(before);
    if (after !== before) plan.push({ rowNumber: Number(row['_rowNumber']), before, after });
  }
  return plan;
}

/** 表示名を実際に作り直す。 */
function renormalizeSenderDisplayNames(): void {
  const plan = planDisplayNameRenormalization(readRows(SHEET_NAMES.SENDERS));
  if (plan.length === 0) {
    console.log('renormalizeSenderDisplayNames: 直す表示名はありませんでした');
    return;
  }
  const updates: CellUpdate[] = plan.map((fix) => ({ rowNumber: fix.rowNumber, key: 'displayName', value: fix.after }));
  updateCells(SHEET_NAMES.SENDERS, updates);
  console.log(`renormalizeSenderDisplayNames: ${plan.length} 件の表示名を直しました`);
}

/** メニューからの実行。変更点のプレビューを見せてから確認する。 */
function menuRenormalizeSenderDisplayNames(): void {
  const ui = SpreadsheetApp.getUi();
  const plan = planDisplayNameRenormalization(readRows(SHEET_NAMES.SENDERS));

  if (plan.length === 0) {
    ui.alert('表示名の再正規化', '直す表示名はありませんでした。', ui.ButtonSet.OK);
    return;
  }

  const preview = plan
    .slice(0, 10)
    .map((fix) => `${fix.before} → ${fix.after}`)
    .join('\n');
  const more = plan.length > 10 ? `\n...他 ${plan.length - 10} 件` : '';
  const message = `${plan.length} 件の表示名を今のルールで直します。\n\n${preview}${more}\n\n実行しますか?`;
  if (ui.alert('表示名の再正規化', message, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;

  const updates: CellUpdate[] = plan.map((fix) => ({ rowNumber: fix.rowNumber, key: 'displayName', value: fix.after }));
  updateCells(SHEET_NAMES.SENDERS, updates);
  ui.alert('表示名の再正規化', `${plan.length} 件を直しました。`, ui.ButtonSet.OK);
}

/** メニューからの実行。対象件数を見せてから確認する。 */
function menuDedupeSenders(): void {
  const ui = SpreadsheetApp.getUi();
  const plan = planSenderDedup(readRows(SHEET_NAMES.SENDERS));

  if (plan.droppedCount === 0) {
    ui.alert('送信元の重複統合', '重複しているアドレスはありませんでした。', ui.ButtonSet.OK);
    return;
  }

  const message =
    `${plan.mergedCount} 件のアドレスが重複しています。統合すると ${plan.droppedCount} 行を削除します。\n` +
    '空欄は他方の値で埋め、初回受信・最終受信・直近90日は矛盾しないよう幅を広げる方向で統合します。\n\n実行しますか?';
  if (ui.alert('送信元の重複統合', message, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;

  replaceRows(SHEET_NAMES.SENDERS, plan.merged);
  ui.alert('送信元の重複統合', `${plan.mergedCount} 件のアドレスを統合しました。`, ui.ButtonSet.OK);
}
