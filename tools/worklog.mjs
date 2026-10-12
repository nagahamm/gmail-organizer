/**
 * 開発時間をコミット履歴から算出する。
 *
 * 記録のための手作業を持たない。手で書く worklog は書き忘れた分が穴になり、
 * 穴があることにも気づけない。コミットの時刻は既に残っているので、それを読む。
 *
 * 表を保存しない。git が記録の正本で、ここはその場で集計するだけ (DRY)。
 *
 * 実測と推定を必ず分けて出す。先頭コミットより前の作業はコミットに現れないので、
 * 実測スパンは必ず過少になる。どちらが観測でどちらが仮定かを混ぜると、
 * 後から見た人がこの数字を信用しすぎる。
 */

import { execFileSync } from 'node:child_process';

/** これ以上空いたら別のセッションとみなす分数。 */
export const DEFAULT_GAP_MINUTES = 90;

/** 1 セッションあたり、先頭コミットより前にかけたと仮定する分数。 */
export const DEFAULT_LEAD_MINUTES = 30;

const MINUTE = 60 * 1000;

/**
 * コミットを時刻の近さでセッションにまとめる。
 *
 * 入力は時刻の昇順でなくてよい。ここで並べ替える。
 */
export function groupSessions(commits, gapMinutes = DEFAULT_GAP_MINUTES) {
  const sorted = commits
    .map((commit) => ({ ...commit, at: new Date(commit.iso).getTime() }))
    .filter((commit) => Number.isFinite(commit.at))
    .sort((left, right) => left.at - right.at);

  const sessions = [];
  for (const commit of sorted) {
    const current = sessions[sessions.length - 1];
    if (current && commit.at - current.end <= gapMinutes * MINUTE) {
      current.end = commit.at;
      current.commits.push(commit);
      continue;
    }
    sessions.push({ start: commit.at, end: commit.at, commits: [commit] });
  }
  return sessions;
}

/** セッションの実測スパン (分)。単独コミットのセッションは 0 になる。 */
export function spanMinutes(session) {
  return Math.round((session.end - session.start) / MINUTE);
}

/** 日付のキー。セッションは開始日に寄せる。日付をまたぐ作業を 2 日に割らない。 */
export function dayKey(at, timeZone = 'Asia/Tokyo') {
  return new Date(at).toLocaleDateString('sv-SE', { timeZone });
}

/**
 * セッションの集計。
 *
 * `measured` は観測値、`estimated` は `lead` を足した仮定入りの値。
 */
export function summarize(sessions, leadMinutes = DEFAULT_LEAD_MINUTES, timeZone = 'Asia/Tokyo') {
  const byDay = new Map();
  let measured = 0;
  let soloSessions = 0;

  for (const session of sessions) {
    const span = spanMinutes(session);
    measured += span;
    if (session.commits.length === 1) soloSessions += 1;

    const key = dayKey(session.start, timeZone);
    const day = byDay.get(key) || { day: key, sessions: 0, commits: 0, measured: 0 };
    day.sessions += 1;
    day.commits += session.commits.length;
    day.measured += span;
    byDay.set(key, day);
  }

  const days = [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day));
  return {
    sessions: sessions.length,
    commits: sessions.reduce((total, session) => total + session.commits.length, 0),
    soloSessions,
    measured,
    estimated: measured + sessions.length * leadMinutes,
    leadMinutes,
    days: days.map((day) => ({ ...day, estimated: day.measured + day.sessions * leadMinutes })),
  };
}

/** 分を「3h 20m」の形にする。 */
export function formatDuration(minutes) {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  return hours === 0 ? `${whole}m` : `${hours}h ${whole % 60}m`;
}

/** 人が読む形のレポート。 */
export function formatReport(summary, options = {}) {
  const { gapMinutes = DEFAULT_GAP_MINUTES, shallow = false, range = '' } = options;
  const lines = [];

  lines.push('# 開発時間');
  lines.push('');
  if (range) lines.push(`対象: ${range}`);
  lines.push(`セッションの区切り: ${gapMinutes} 分以上の間隔`);
  lines.push('');

  if (shallow) {
    lines.push('**警告: 浅いクローンです。** 取得済みのコミットしか集計していないため、');
    lines.push('期間が途中で切れています。`git fetch --unshallow` を実行してから出し直してください。');
    lines.push('');
  }

  lines.push(`実測 (コミット間のみ): ${formatDuration(summary.measured)}`);
  lines.push(`推定 (先頭コミット前に 1 セッション ${summary.leadMinutes} 分を加算): ${formatDuration(summary.estimated)}`);
  lines.push('');
  lines.push(`${summary.sessions} セッション / ${summary.commits} コミット`);
  if (summary.soloSessions > 0) {
    lines.push(
      `うち ${summary.soloSessions} セッションは単独コミットで、実測は 0 分として入っています。`
    );
  }
  lines.push('');
  lines.push('| 日付 | セッション | コミット | 実測 | 推定 |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  for (const day of summary.days) {
    lines.push(
      `| ${day.day} | ${day.sessions} | ${day.commits} | ${formatDuration(day.measured)} | ${formatDuration(day.estimated)} |`
    );
  }

  return lines.join('\n');
}

/** `git log` を読む。--numstat などは使わず時刻と件名だけ。 */
function readCommits() {
  const out = execFileSync('git', ['log', '--date=iso-strict', '--pretty=%H%x09%ad%x09%an%x09%s'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  return out
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [hash, iso, author, ...rest] = line.split('\t');
      return { hash, iso, author, subject: rest.join('\t') };
    });
}

function isShallow() {
  try {
    return execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim() === 'true';
  } catch {
    return false;
  }
}

/** `--gap=90` `--lead=30` の形の引数を読む。 */
export function parseArgs(argv) {
  const options = { gapMinutes: DEFAULT_GAP_MINUTES, leadMinutes: DEFAULT_LEAD_MINUTES };
  for (const arg of argv) {
    const gap = /^--gap=(\d+)$/.exec(arg);
    if (gap) options.gapMinutes = Number(gap[1]);
    const lead = /^--lead=(\d+)$/.exec(arg);
    if (lead) options.leadMinutes = Number(lead[1]);
  }
  return options;
}

function main() {
  const { gapMinutes, leadMinutes } = parseArgs(process.argv.slice(2));
  const commits = readCommits();
  const sessions = groupSessions(commits, gapMinutes);
  const summary = summarize(sessions, leadMinutes);

  const range =
    summary.days.length > 0
      ? `${summary.days[0].day} 〜 ${summary.days[summary.days.length - 1].day}`
      : 'コミットなし';

  console.log(formatReport(summary, { gapMinutes, shallow: isShallow(), range }));
}

// 直接実行されたときだけ走らせる。テストから import しても main は動かない。
if (process.argv[1] && process.argv[1].endsWith('worklog.mjs')) main();
