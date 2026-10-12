/**
 * エントリポイントと定期実行。
 *
 * 時間主導トリガーは PC の電源に依存せず動く。これが GAS を選んだ理由の 1 つ。
 */

/** 1 時間おきに呼ばれる本体。トリガー数とクォータを節約するため 1 本にまとめる。 */
function everyHour(): void {
  // 今日すでに Gmail の日次上限に達したと分かっているなら、API を叩かずに
  // 即座に諦める。上限は 1 日中変わらないので、リセットされるまで毎回
  // 同じ例外を出し続けても無駄なだけ (docs/design.md)。
  if (isGmailQuotaKnownExhaustedToday()) {
    console.log('everyHour: 本日は Gmail の日次上限に達しているため、実行をスキップします');
    return;
  }

  try {
    assertGmailQuotaAvailable();
    try {
      runHourlySteps(Date.now());
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 列を足すコード変更を push した直後は、人が setup() を押すまでシートが追いつかない。
      // 無人で回る経路なので、ここだけは自分で追いつかせて一度だけ試し直す。
      // それ以外の失敗は黙って回復させない。本当に壊れているときに気づけなくなる。
      if (!isMissingColumnError(message)) throw error;
      console.warn(`everyHour: ${message} シートを合わせて再試行します`);
    }

    ensureSheets();
    runHourlySteps(Date.now());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 上限超過が assertGmailQuotaAvailable の外、実行の途中で判明した場合も
    // ここで記録し、この日は以後スキップさせる。1 回だけは例外として表に出し、
    // 気づけるようにしてから終える。
    if (isGmailQuotaExceeded(message)) markGmailQuotaExhaustedToday();
    throw error;
  }
}

/** 毎時の中身。3 つのステップで 1 つの予算を分け合う。 */
function runHourlySteps(startedAt: number): void {
  // ステップごとに数え直すと 6 分制限を超え、writeLog() に到達せずログにも何も残らない。
  applyApprovedProposals(startedAt);
  applyToNewMail(startedAt);
  promoteStarredJobs(startedAt);
  // 中断した遡及・張り替えの続き。新着より後に置く。
  // 大量の過去メールに予算を先取りされて、今日届いた分が待たされないようにする。
  continueRetroactive(startedAt);
  // 洗い出しは最後。遡及が残っている間は自分で降りるので、順序で priority を表す。
  continueBacklog(startedAt);
  // sendersの全期間洗い出しも同じ理由で最後。完了していれば何もしない。
  continueSendersFullScan(startedAt);
}

/** トリガーを登録する。既存の同名トリガーは消してから作り直す。 */
function installTriggers(): void {
  // everyQuarterHour は 15 分間隔だった頃の名前。既に登録されている古いトリガーを
  // 消すために残す。ここから外すと、存在しない関数を指したトリガーが生き残って
  // 15 分ごとに静かに失敗し続ける。
  const managed = [
    'everyHour',
    'everyQuarterHour',
    'applyRetroactive',
    'runWeeklyDigest',
    'proposeFromReplyMail',
  ];

  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (managed.indexOf(trigger.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(trigger);
  }

  // GAS の時間主導トリガーは実行時刻を指定できない。`everyHours(1)` は
  // **この関数を実行した時刻を起点**に 1 時間間隔で回る。:00 に揃えたい場合は、
  // 毎時 :00 ちょうどにこの関数を実行し直す。
  ScriptApp.newTrigger('everyHour').timeBased().everyHours(1).create();
  // 月次の取りこぼし回収。applyToNewMail() の対象は newer_than:2d なので、
  // それより長く止まった分やルールを後から足した分はこちらでしか拾えない。
  // applyRetroactive() は引数を取らないので、トリガーのイベントオブジェクトを
  // 誤って受けることがない。そのまま登録してよい。
  // 時刻はスクリプトのタイムゾーン (Asia/Tokyo) で解釈される。
  ScriptApp.newTrigger('applyRetroactive').timeBased().onMonthDay(1).atHour(0).create();
  ScriptApp.newTrigger('runWeeklyDigest').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(7).create();
  // Claude の週次 Routine は runWeeklyDigest (日曜 7 時) の後、日曜のうちに中継メールを送る想定。
  // 月曜の朝にすればどちらも確実に間に合う (docs/design.md 5.6)。
  ScriptApp.newTrigger('proposeFromReplyMail').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();

  // シートから実行したときにも登録されたことが見えるようにする。console はシートから見えない。
  const message =
    `トリガーを登録しました: everyHour (1 時間間隔。起点は今の時刻 ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm')}) / ` +
    'applyRetroactive (毎月 1 日 0 時) / runWeeklyDigest (日曜 7 時) / proposeFromReplyMail (月曜 8 時)';
  console.log(message);
  activeBook().toast(message, 'gmail-organizer', 10);
}

/** 登録済みトリガーを全て外す。運用を止めるとき用。 */
function uninstallTriggers(): void {
  for (const trigger of ScriptApp.getProjectTriggers()) ScriptApp.deleteTrigger(trigger);
  console.log('トリガーを全て外しました');
}

/** スプレッドシートを開いたときのメニュー。 */
/** メニュー 1 項目。`handler` はグローバルに実在する関数名でなければならない。 */
interface MenuEntry {
  label: string;
  handler: string;
}

/** メニュー 1 階層。`title` があればサブメニューに畳む。 */
interface MenuGroup {
  title?: string;
  entries: MenuEntry[];
}

/**
 * メニューの定義。
 *
 * **メニューはスケジュールを映す。** 項目はトリガーの束に対応させ、関数には
 * 対応させない。関数ごとに項目を足していた結果 26 項目まで育ったので、
 * 「今すぐ回す」は束ごとに 1 つだけ置く (Issue #99)。
 *
 * 個別の関数を回したいときは「個別に回す」に畳んである。
 * 開発用のデータ投入はここに置かない。使い切りの操作はメニューに載せず、
 * Apps Script エディタの「関数を選択して実行」から呼ぶ (CLAUDE.md)。
 *
 * データとして持つのは `npm test` で不変条件を見るため。GAS は存在しない
 * 関数名を指した項目をクリックしても静かに失敗する。
 */
const MENU_SPEC: MenuGroup[] = [
  {
    entries: [
      { label: '1. シートを作成 / 更新', handler: 'setup' },
      { label: '2. 現在のラベルとフィルタを取り込む', handler: 'importCurrentState' },
    ],
  },
  {
    // トリガーの束と 1 対 1。中身は runHourlySteps / runWeeklyDigest が持つ。
    entries: [
      { label: '今すぐ回す (毎時ぶん)', handler: 'menuRunHourly' },
      { label: '今すぐ回す (週次ぶん)', handler: 'runWeeklyDigest' },
    ],
  },
  {
    // 最初の一押しが人の仕事で、続きは毎時のトリガーが拾うもの。
    entries: [
      { label: '過去メールへ遡及適用する', handler: 'menuApplyRetroactive' },
      { label: '印を付けた行を張り替える', handler: 'menuApplyRelabel' },
      { label: '過去の未分類を洗い出す', handler: 'menuSurveyBacklog' },
    ],
  },
  {
    title: '個別に回す',
    entries: [
      { label: '新着に適用する', handler: 'applyToNewMail' },
      { label: '承認済みの提案を反映する', handler: 'applyApprovedProposals' },
      { label: 'スター付き求人を昇格する', handler: 'promoteStarredJobs' },
      { label: '送信元マスタを更新する', handler: 'refreshSenders' },
      { label: '返信メールの提案を取り込む', handler: 'proposeFromReplyMail' },
      { label: '応募済みスレッドを提案する', handler: 'proposeAppliedJobs' },
      { label: 'labelsを並べ替える', handler: 'menuSortLabelsSheet' },
      { label: 'sendersを並べ替える', handler: 'menuSortSendersSheet' },
    ],
  },
  {
    title: 'メンテナンス・復旧用',
    entries: [
      { label: '実行の状態を見る', handler: 'menuShowProgress' },
      { label: 'シートを検査する', handler: 'menuValidateSheets' },
      { label: '親ラベルを作る', handler: 'ensureParentLabels' },
      { label: '遡及の再開位置を消す', handler: 'resetRetroactive' },
      { label: '洗い出しの再開位置を消す', handler: 'resetBacklog' },
      { label: 'sendersの全期間洗い出しをやり直す', handler: 'resetSendersFullScan' },
      { label: 'トリガーを登録する', handler: 'installTriggers' },
      { label: 'トリガーを全て外す', handler: 'uninstallTriggers' },
    ],
  },
];

/** `MENU_SPEC` に出てくる関数名。重複の検査に使う。 */
function menuHandlerNames(spec: MenuGroup[]): string[] {
  const names: string[] = [];
  for (const group of spec) {
    for (const entry of group.entries) names.push(entry.handler);
  }
  return names;
}

function onOpen(): void {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('gmail-organizer');

  let first = true;
  for (const group of MENU_SPEC) {
    if (group.title) {
      const sub = ui.createMenu(group.title);
      for (const entry of group.entries) sub.addItem(entry.label, entry.handler);
      menu.addSeparator().addSubMenu(sub);
      continue;
    }
    if (!first) menu.addSeparator();
    for (const entry of group.entries) menu.addItem(entry.label, entry.handler);
    first = false;
  }

  menu.addToUi();
}

/** 毎時の束を手で回す。中身はトリガーと同じ。 */
function menuRunHourly(): void {
  runHourlySteps(Date.now());
}

/** 遡及適用は対象が広いので、メニューからは確認を挟む。 */
function menuApplyRetroactive(): void {
  const ui = SpreadsheetApp.getUi();
  const dryRun = isDryRun();
  const window = readConfig('RETRO_QUERY_WINDOW', CONFIG.RETRO_QUERY_WINDOW);

  const tail =
    '\n\n1 日の上限に達したら中断し、毎時の自動実行が翌日以降も続きを流します。\n' +
    '再開位置は DRY_RUN の有無で別に持つので、切り替えても混ざりません。';
  const message = dryRun
    ? `DRY_RUN が有効です。ラベルは変更せず log に記録するだけです。\n対象期間: ${describeQueryWindow(window)}${tail}\n\n実行しますか?`
    : `DRY_RUN が無効です。実際にラベルを付け替えます。\n対象期間: ${describeQueryWindow(window)}${tail}\n\nlog シートでドライランの結果を確認済みですか?`;

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
対象期間: ${describeQueryWindow(window)}

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

/**
 * 洗い出しは読み取りだけだが、全期間を走査するので日をまたぐ。
 * 始める前に、遡及を先に終わらせてあるかを確かめる。
 */
function menuSurveyBacklog(): void {
  const ui = SpreadsheetApp.getUi();

  const message =
    'ラベルの付いていない過去メールを、送信元ドメイン別に backlog シートへ集計します。\n' +
    'ラベルは変更しません。読み取りだけです。\n\n' +
    '⚠️ 遡及適用を先に流し切ってください。ラベルが付くたびに検索結果が縮み、走査が取りこぼします。\n' +
    '1 日の上限に達したら中断し、毎時の自動実行が翌日以降も続きを流します。\n\n' +
    '開始しますか?';

  if (ui.alert('過去の未分類を洗い出す', message, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  surveyBacklog();
}

/** 何日もかかる処理がどこまで進んだかを、その場で確かめる。 */
function menuShowProgress(): void {
  const ui = SpreadsheetApp.getUi();
  ui.alert('実行の状態', describeProgress(readRunProgress()).join('\n'), ui.ButtonSet.OK);
}
