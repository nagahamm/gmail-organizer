/**
 * エントリポイントと定期実行。
 *
 * 時間主導トリガーは PC の電源に依存せず動く。これが GAS を選んだ理由の 1 つ。
 */

/** 15 分おきに呼ばれる本体。トリガー数とクォータを節約するため 1 本にまとめる。 */
function everyQuarterHour(): void {
  applyToNewMail();
  promoteStarredJobs();
}

/** トリガーを登録する。既存の同名トリガーは消してから作り直す。 */
function installTriggers(): void {
  const managed = ['everyQuarterHour', 'runWeeklyDigest'];

  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (managed.indexOf(trigger.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(trigger);
  }

  ScriptApp.newTrigger('everyQuarterHour').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('runWeeklyDigest').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(7).create();
  console.log('トリガーを登録しました: everyQuarterHour (15 分間隔) / runWeeklyDigest (日曜 7 時)');
}

/** 登録済みトリガーを全て外す。運用を止めるとき用。 */
function uninstallTriggers(): void {
  for (const trigger of ScriptApp.getProjectTriggers()) ScriptApp.deleteTrigger(trigger);
  console.log('トリガーを全て外しました');
}

/** スプレッドシートを開いたときのメニュー。 */
function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu('gmail-organizer')
    .addItem('1. シートを作成 / 更新', 'setup')
    .addItem('2. 現在のラベルとフィルタを取り込む', 'importCurrentState')
    .addItem('3. 移行前の実態を調査する', 'runSampling')
    .addSeparator()
    .addItem('新着に適用する', 'applyToNewMail')
    .addItem('スター付き求人を昇格する', 'promoteStarredJobs')
    .addItem('週次ダイジェストを作る', 'runWeeklyDigest')
    .addItem('過去メールへ遡及適用する', 'menuApplyRetroactive')
    .addItem('遡及の再開位置を消す', 'resetRetroactive')
    .addSeparator()
    .addItem('照合ロジックの自己テスト', 'runMatcherSelfTest')
    .addItem('トリガーを登録する', 'installTriggers')
    .addItem('トリガーを全て外す', 'uninstallTriggers')
    .addToUi();
}

/** 遡及適用は対象が広いので、メニューからは確認を挟む。 */
function menuApplyRetroactive(): void {
  const ui = SpreadsheetApp.getUi();
  const dryRun = isDryRun();
  const window = readConfig('RETRO_QUERY_WINDOW', CONFIG.RETRO_QUERY_WINDOW);

  const message = dryRun
    ? `DRY_RUN が有効です。ラベルは変更せず log に記録するだけです。\n対象期間: ${window}\n実行しますか?`
    : `DRY_RUN が無効です。実際にラベルを付け替えます。\n対象期間: ${window}\n\nlog シートでドライランの結果を確認済みですか?`;

  if (ui.alert('遡及適用', message, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  applyRetroactive();
}
