/**
 * エントリポイントと定期実行。
 *
 * 時間主導トリガーは PC の電源に依存せず動く。これが GAS を選んだ理由の 1 つ。
 */

/** 15 分おきに呼ばれる本体。トリガー数とクォータを節約するため 1 本にまとめる。 */
function everyQuarterHour(): void {
  try {
    runQuarterHourSteps(Date.now());
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 列を足すコード変更を push した直後は、人が setup() を押すまでシートが追いつかない。
    // 無人で回る経路なので、ここだけは自分で追いつかせて一度だけ試し直す。
    // それ以外の失敗は黙って回復させない。本当に壊れているときに気づけなくなる。
    if (!isMissingColumnError(message)) throw error;
    console.warn(`everyQuarterHour: ${message} シートを合わせて再試行します`);
  }

  ensureSheets();
  runQuarterHourSteps(Date.now());
}

/** 15 分ごとの中身。3 つのステップで 1 つの予算を分け合う。 */
function runQuarterHourSteps(startedAt: number): void {
  // ステップごとに数え直すと 6 分制限を超え、writeLog() に到達せずログにも何も残らない。
  applyApprovedProposals(startedAt);
  applyToNewMail(startedAt);
  promoteStarredJobs(startedAt);
  // 中断した遡及・張り替えの続き。新着より後に置く。
  // 大量の過去メールに予算を先取りされて、今日届いた分が待たされないようにする。
  continueRetroactive(startedAt);
}

/** トリガーを登録する。既存の同名トリガーは消してから作り直す。 */
function installTriggers(): void {
  const managed = ['everyQuarterHour', 'applyRetroactive', 'runWeeklyDigest'];

  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (managed.indexOf(trigger.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(trigger);
  }

  // GAS の時間主導トリガーは実行時刻を指定できない。`everyMinutes(15)` は
  // **この関数を実行した時刻を起点**に 15 分間隔で回る。:00 / :15 / :30 / :45 に
  // 揃えたい場合は、毎時 :00 ちょうどにこの関数を実行し直す。
  ScriptApp.newTrigger('everyQuarterHour').timeBased().everyMinutes(15).create();
  // 月次の取りこぼし回収。applyToNewMail() の対象は newer_than:2d なので、
  // それより長く止まった分やルールを後から足した分はこちらでしか拾えない。
  // applyRetroactive() は引数を取らないので、トリガーのイベントオブジェクトを
  // 誤って受けることがない。そのまま登録してよい。
  // 時刻はスクリプトのタイムゾーン (Asia/Tokyo) で解釈される。
  ScriptApp.newTrigger('applyRetroactive').timeBased().onMonthDay(1).atHour(0).create();
  ScriptApp.newTrigger('runWeeklyDigest').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(7).create();

  // シートから実行したときにも登録されたことが見えるようにする。console はシートから見えない。
  const message =
    `トリガーを登録しました: everyQuarterHour (15 分間隔。起点は今の時刻 ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm')}) / ` +
    'applyRetroactive (毎月 1 日 0 時) / runWeeklyDigest (日曜 7 時)';
  console.log(message);
  activeBook().toast(message, 'gmail-organizer', 10);
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
    .addSeparator()
    .addItem('新着に適用する', 'applyToNewMail')
    .addItem('スター付き求人を昇格する', 'promoteStarredJobs')
    .addItem('送信元マスタを更新する', 'refreshSenders')
    .addItem('週次ダイジェストを作る', 'runWeeklyDigest')
    .addItem('応募済みスレッドを提案する', 'proposeAppliedJobs')
    .addItem('承認済みの提案を反映する', 'applyApprovedProposals')
    .addItem('過去メールへ遡及適用する', 'menuApplyRetroactive')
    .addItem('印を付けた行を張り替える', 'menuApplyRelabel')
    .addItem('遡及の再開位置を消す', 'resetRetroactive')
    .addItem('親ラベルを作る', 'ensureParentLabels')
    .addSeparator()
    .addItem('シートを検査する', 'menuValidateSheets')
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

/**
 * 張り替えは保護を外して流すので、何行が対象かを見せてから確認する。
 *
 * 対象行数を先に出すのは、印の付け忘れ・付けすぎにここで気づけるようにするため。
 * 実行してもシートの `受信トレイ除外` と `既読化` は変わらない。
 */
function menuApplyRelabel(): void {
  const ui = SpreadsheetApp.getUi();
  const dryRun = isDryRun();
  const window = readConfig('RETRO_QUERY_WINDOW', CONFIG.RETRO_QUERY_WINDOW);
  const marked = loadRules().filter((rule) => rule.relabel && rule.enabled).length;

  if (marked === 0) {
    ui.alert('張り替え', 'rules の「張り替え」に印の付いた有効な行がありません。', ui.ButtonSet.OK);
    return;
  }

  const head = `対象: ${marked} 行
対象期間: ${window}

実行中だけ「受信トレイ除外」と「既読化」を外して過去メールへ流します。
シートの設定は書き換えません。旧ラベルも消えません。`;
  const message = dryRun
    ? `DRY_RUN が有効です。ラベルは変更せず log に記録するだけです。

${head}

実行しますか?`
    : `DRY_RUN が無効です。実際にラベルを付けます。

${head}

log シートでドライランの結果を確認済みですか?`;

  if (ui.alert('張り替え', message, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  applyRelabel();
}
