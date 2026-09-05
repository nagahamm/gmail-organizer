/**
 * 実行の状態。
 *
 * 遡及適用・張り替え・過去の未分類の洗い出しは、日次予算で区切って何日かに分けて流れる。
 * 放っておくと「進んでいるのか止まっているのか」が分からなくなるので、
 * **位置と使用量という事実だけ**を見せる。
 *
 * 残り時間や完了予定は出さない。1 日に進む量は対象の密度で変わるし、
 * 外れた予測は「止まっている」の誤認を生む (docs/requirements.md)。
 */

interface RunProgress {
  /** その日の使用量を数えている日付。空なら一度も走っていない。 */
  day: string;
  usedToday: number;
  dailyBudget: number;
  /** 中断中でなければ null。 */
  retro: RetroCursor | null;
  relabel: RetroCursor | null;
  backlog: RetroCursor | null;
  backlogDomains: number;
}

/**
 * 状態を人が読む行にする。
 *
 * GAS API に触れないので `npm test` で検証できる。
 */
function describeProgress(progress: RunProgress): string[] {
  const lines: string[] = ['■ 実行の状態'];
  lines.push(`  今日の使用量: ${progress.usedToday} / ${progress.dailyBudget} スレッド`);

  const running: string[] = [];
  if (progress.retro) {
    running.push(
      `  遡及適用: 中断中 (${progress.retro.ruleIndex + 1} 本目のルール、位置 ${progress.retro.start})`
    );
  }
  if (progress.relabel) {
    running.push(
      `  張り替え: 中断中 (${progress.relabel.ruleIndex + 1} 本目のルール、位置 ${progress.relabel.start})`
    );
  }
  if (progress.backlog) {
    running.push(`  過去の未分類の洗い出し: 中断中 (位置 ${progress.backlog.start})`);
  }

  if (running.length === 0) {
    lines.push('  中断中の処理はありません');
  } else {
    for (const line of running) lines.push(line);
    lines.push('  続きは 15 分ごとの自動実行が流します。');
  }

  lines.push(`  backlog: ${progress.backlogDomains} ドメイン`);
  return lines;
}

/** 状態を集める。中断していない処理は null になる。 */
function readRunProgress(): RunProgress {
  const usage = readDailyUsage();
  const today = todayKey();

  return {
    day: usage.day,
    usedToday: usage.day === today ? usage.threads : 0,
    dailyBudget: readDailyBudget(),
    retro: readCursorIfAny(RETRO_CURSOR_KEY),
    relabel: readCursorIfAny(RELABEL_CURSOR_KEY),
    backlog: readCursorIfAny(BACKLOG_CURSOR_KEY),
    backlogDomains: readRows(SHEET_NAMES.BACKLOG).length,
  };
}

/** 中断していれば再開位置、していなければ null。 */
function readCursorIfAny(key: string): RetroCursor | null {
  return hasCursor(key) ? readCursor(key) : null;
}
