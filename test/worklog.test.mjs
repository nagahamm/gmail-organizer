/**
 * tools/worklog.mjs の集計を検証する。
 *
 * GAS バンドルに依存しないので test/load.mjs は通さない。
 * 時間の数字は後から検算できないので、区切り方と合計はここで固定する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  groupSessions,
  spanMinutes,
  summarize,
  formatDuration,
  formatReport,
  parseArgs,
  dayKey,
  DEFAULT_GAP_MINUTES,
  DEFAULT_LEAD_MINUTES,
} from '../tools/worklog.mjs';

/** 指定の時刻 (JST) のコミット。 */
function commitAt(iso, subject = 'test') {
  return { hash: iso, iso, author: 'tester', subject };
}

test('間隔が区切り未満なら同じセッションにまとめる', () => {
  const sessions = groupSessions([
    commitAt('2026-09-01T10:00:00+09:00'),
    commitAt('2026-09-01T10:30:00+09:00'),
    commitAt('2026-09-01T11:00:00+09:00'),
  ]);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].commits.length, 3);
  assert.equal(spanMinutes(sessions[0]), 60);
});

test('区切り以上空いたら別のセッションにする', () => {
  const sessions = groupSessions(
    [commitAt('2026-09-01T10:00:00+09:00'), commitAt('2026-09-01T12:00:00+09:00')],
    90
  );
  assert.equal(sessions.length, 2);
  assert.equal(spanMinutes(sessions[0]), 0);
});

test('ちょうど区切りと同じ間隔は同じセッションに含める', () => {
  const sessions = groupSessions(
    [commitAt('2026-09-01T10:00:00+09:00'), commitAt('2026-09-01T11:30:00+09:00')],
    90
  );
  assert.equal(sessions.length, 1);
});

test('入力が時刻順でなくても並べ替えてまとめる', () => {
  const sessions = groupSessions([
    commitAt('2026-09-01T11:00:00+09:00'),
    commitAt('2026-09-01T10:00:00+09:00'),
  ]);
  assert.equal(sessions.length, 1);
  assert.equal(spanMinutes(sessions[0]), 60);
});

test('時刻が読めないコミットは捨てる', () => {
  const sessions = groupSessions([commitAt('not-a-date'), commitAt('2026-09-01T10:00:00+09:00')]);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].commits.length, 1);
});

test('コミットが無ければセッションも無い', () => {
  assert.deepEqual(groupSessions([]), []);
});

test('実測と推定を分けて集計する', () => {
  const sessions = groupSessions([
    commitAt('2026-09-01T10:00:00+09:00'),
    commitAt('2026-09-01T11:00:00+09:00'),
    commitAt('2026-09-01T15:00:00+09:00'),
  ]);
  const summary = summarize(sessions, 30);

  assert.equal(summary.sessions, 2);
  assert.equal(summary.commits, 3);
  assert.equal(summary.soloSessions, 1);
  assert.equal(summary.measured, 60);
  // 実測 60 分 + 2 セッション × 30 分
  assert.equal(summary.estimated, 120);
});

test('lead が 0 なら推定は実測と一致する', () => {
  const sessions = groupSessions([
    commitAt('2026-09-01T10:00:00+09:00'),
    commitAt('2026-09-01T10:45:00+09:00'),
  ]);
  const summary = summarize(sessions, 0);
  assert.equal(summary.measured, 45);
  assert.equal(summary.estimated, 45);
});

test('日付をまたぐセッションは開始日に寄せる', () => {
  const sessions = groupSessions([
    commitAt('2026-09-01T23:30:00+09:00'),
    commitAt('2026-09-02T00:30:00+09:00'),
  ]);
  const summary = summarize(sessions, 0);

  assert.equal(summary.days.length, 1);
  assert.equal(summary.days[0].day, '2026-09-01');
  assert.equal(summary.days[0].measured, 60);
});

test('日別の内訳は日付の昇順で並ぶ', () => {
  const sessions = groupSessions([
    commitAt('2026-09-03T10:00:00+09:00'),
    commitAt('2026-09-01T10:00:00+09:00'),
    commitAt('2026-09-02T10:00:00+09:00'),
  ]);
  const summary = summarize(sessions, 0);
  assert.deepEqual(
    summary.days.map((day) => day.day),
    ['2026-09-01', '2026-09-02', '2026-09-03']
  );
});

test('dayKey はタイムゾーンで日付が変わる', () => {
  const at = new Date('2026-09-01T23:30:00+09:00').getTime();
  assert.equal(dayKey(at, 'Asia/Tokyo'), '2026-09-01');
  assert.equal(dayKey(at, 'UTC'), '2026-09-01');
});

test('分を時分に整形する', () => {
  assert.equal(formatDuration(0), '0m');
  assert.equal(formatDuration(59), '59m');
  assert.equal(formatDuration(60), '1h 0m');
  assert.equal(formatDuration(200), '3h 20m');
});

test('浅いクローンなら警告を出す', () => {
  const summary = summarize(groupSessions([commitAt('2026-09-01T10:00:00+09:00')]), 30);
  const report = formatReport(summary, { shallow: true });
  assert.match(report, /浅いクローン/);
  assert.match(report, /--unshallow/);
});

test('浅くなければ警告を出さない', () => {
  const summary = summarize(groupSessions([commitAt('2026-09-01T10:00:00+09:00')]), 30);
  assert.doesNotMatch(formatReport(summary, { shallow: false }), /浅いクローン/);
});

test('引数が無ければ既定値を使う', () => {
  assert.deepEqual(parseArgs([]), {
    gapMinutes: DEFAULT_GAP_MINUTES,
    leadMinutes: DEFAULT_LEAD_MINUTES,
  });
});

test('gap と lead を引数で上書きする', () => {
  assert.deepEqual(parseArgs(['--gap=120', '--lead=0']), { gapMinutes: 120, leadMinutes: 0 });
});
