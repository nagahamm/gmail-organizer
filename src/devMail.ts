/**
 * 開発用データ投入・更新をメール経由で行う。
 *
 * devSeed.ts の Drive 経路は `DriveApp` の認可が必要で、環境によっては
 * OAuth の再認可画面が固まって進めないことがある。GmailApp は既に認可済みの
 * ことが多いので、同じ CSV を固定件名のメールに乗せて渡す代替経路を用意する。
 * パース・変換ロジック (rowsFromTable / coerceRowTypes / buildDevUpdates) は
 * devSeed.ts のものをそのまま再利用する。
 */

/** 件名の接頭辞。`[gmail-organizer] dev-seed: <シート名>` の形を探す。 */
const DEV_MAIL_SEED_PREFIX = '[gmail-organizer] dev-seed:';

/** 件名の接頭辞。`[gmail-organizer] dev-update: <シート名>` の形を探す。 */
const DEV_MAIL_UPDATE_PREFIX = '[gmail-organizer] dev-update:';

/**
 * 件名の接頭辞。`[gmail-organizer] dev-overwrite: <シート名>` の形を探す。
 * dev-update と違い、既に値が入っているセルもCSV側の値で上書きする。
 */
const DEV_MAIL_OVERWRITE_PREFIX = '[gmail-organizer] dev-overwrite:';

/** 本文に埋め込まれた CSV を取り出す境界。 */
const DEV_MAIL_BEGIN = 'GMAIL_ORGANIZER_DEV_DATA_BEGIN';
const DEV_MAIL_END = 'GMAIL_ORGANIZER_DEV_DATA_END';

/** 処理済みの開発用メールに付ける印。二重取り込みを防ぐ。 */
const DEV_MAIL_PROCESSED_LABEL = 'gmail-organizer/dev-processed';

/**
 * 本文の境界内から CSV 文字列を取り出す。パース自体 (`Utilities.parseCsv`) は
 * GAS API なのでここではしない。呼び出し側が空でなければパースする。
 *
 * GAS API に触れないので npm test で検証できる。
 */
function extractDevMailPayload(body: string): string {
  const text = String(body || '');
  const start = text.indexOf(DEV_MAIL_BEGIN);
  const end = text.indexOf(DEV_MAIL_END);
  if (start < 0 || end < 0 || end < start) return '';

  return text.slice(start + DEV_MAIL_BEGIN.length, end).trim();
}

/** 本文の境界内から CSV を取り出して表にする。 */
function parseDevMailCsv(body: string): string[][] {
  const csv = extractDevMailPayload(body);
  if (csv === '') return [];
  return Utilities.parseCsv(csv);
}

/** 件名からシート名を取り出す。`prefix` の後ろの空白を落とすだけ。 */
function sheetNameFromSubject(subject: string, prefix: string): string {
  return subject.slice(prefix.length).trim();
}

/**
 * 取り込み済みの印を付けて受信トレイから片付ける。
 * ラベルだけで二重取り込みは防げるが、機械可読メールが受信トレイに溜まり続けるのを防ぐため
 * アーカイブする (ゴミ箱は30日で自動削除されるため、送った内容の履歴を残せるこちらにする)。
 */
function markDevMailProcessed(thread: GoogleAppsScript.Gmail.GmailThread, processedLabel: GoogleAppsScript.Gmail.GmailLabel): void {
  thread.addLabel(processedLabel);
  thread.moveToArchive();
}

/** 件名が固定の開発用メールを検索し、シート名ごとに { thread, sheetName, body } へ束ねる。 */
function findDevMailThreads(
  subjectPrefix: string
): { thread: GoogleAppsScript.Gmail.GmailThread; sheetName: string; body: string }[] {
  const threads = GmailApp.search(
    `subject:"${subjectPrefix}" -label:${DEV_MAIL_PROCESSED_LABEL}`,
    0,
    CONFIG.SEARCH_PAGE_SIZE
  );
  const found: { thread: GoogleAppsScript.Gmail.GmailThread; sheetName: string; body: string }[] = [];

  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      const subject = message.getSubject() || '';
      if (subject.indexOf(subjectPrefix) !== 0) continue;

      const sheetName = sheetNameFromSubject(subject, subjectPrefix);
      if (!hasSheetSpec(sheetName)) {
        console.warn(`findDevMailThreads: 未知のシート名です。取り込みません: ${sheetName} (${subject})`);
        continue;
      }
      found.push({ thread, sheetName, body: message.getPlainBody() });
    }
  }
  return found;
}

/** メール経由の新規行追加。devSeed.ts の importDevSeed とロジックは同じ、取得元だけ違う。 */
function importDevSeedFromMail(): void {
  const targets = findDevMailThreads(DEV_MAIL_SEED_PREFIX);
  if (targets.length === 0) {
    console.log('importDevSeedFromMail: 取り込み対象のメールが見つかりませんでした');
    return;
  }

  const processedLabel = getOrCreateLabel(DEV_MAIL_PROCESSED_LABEL);
  for (const { thread, sheetName, body } of targets) {
    const spec = findSheetSpec(sheetName);
    const rows = rowsFromTable(parseDevMailCsv(body)).map((row) => coerceRowTypes(row, spec));
    appendRows(sheetName, rows);
    markDevMailProcessed(thread, processedLabel);
    console.log(`importDevSeedFromMail: ${sheetName} へ ${rows.length} 行取り込みました`);
  }
}

/** メール経由の空セル更新。devSeed.ts の importDevUpdate とロジックは同じ、取得元だけ違う。 */
function importDevUpdateFromMail(): void {
  const targets = findDevMailThreads(DEV_MAIL_UPDATE_PREFIX);
  if (targets.length === 0) {
    console.log('importDevUpdateFromMail: 取り込み対象のメールが見つかりませんでした');
    return;
  }

  const processedLabel = getOrCreateLabel(DEV_MAIL_PROCESSED_LABEL);
  for (const { thread, sheetName, body } of targets) {
    const table = parseDevMailCsv(body);
    if (table.length === 0) continue;
    const existingRows = readRows(sheetName);
    const updates = buildDevUpdates(table, existingRows, table[0][0]);
    updateCells(sheetName, updates);
    markDevMailProcessed(thread, processedLabel);
    console.log(`importDevUpdateFromMail: ${sheetName} へ ${updates.length} セルを更新しました`);
  }
}

/**
 * メール経由の直値上書き。既に値が入っているセルもCSV側の値で上書きする。
 * 運営元・サービス・表示名など、人が見て直したメタデータの反映に使う。
 */
function importDevOverwriteFromMail(): void {
  const targets = findDevMailThreads(DEV_MAIL_OVERWRITE_PREFIX);
  if (targets.length === 0) {
    console.log('importDevOverwriteFromMail: 取り込み対象のメールが見つかりませんでした');
    return;
  }

  const processedLabel = getOrCreateLabel(DEV_MAIL_PROCESSED_LABEL);
  for (const { thread, sheetName, body } of targets) {
    const table = parseDevMailCsv(body);
    if (table.length === 0) continue;
    const existingRows = readRows(sheetName);
    const updates = buildDevOverwrites(table, existingRows, table[0][0]);
    updateCells(sheetName, updates);
    markDevMailProcessed(thread, processedLabel);
    console.log(`importDevOverwriteFromMail: ${sheetName} へ ${updates.length} セルを上書きしました`);
  }
}

/** メニューからの実行。 */
function menuImportDevMail(): void {
  assertGmailQuotaAvailable();
  importDevSeedFromMail();
  importDevUpdateFromMail();
  importDevOverwriteFromMail();
  SpreadsheetApp.getUi().alert(
    '開発用データ (メール経由)',
    '取り込みを実行しました。詳細はログを確認してください。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
