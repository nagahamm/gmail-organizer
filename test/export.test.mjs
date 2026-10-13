/**
 * CSV の組み立てを検証する。
 *
 * 書き出した CSV は devSeed.ts で取り込み直せる。壊れた CSV を作ると
 * そのままシートへ戻るので、エスケープはここで固定する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { csvCell, toCsv, isExportableSheet, anchorBlocks, writableBlocks, findSheetSpec } = load();

test('ふつうの値はそのまま出す', () => {
  assert.equal(csvCell('Promotions/Fashion'), 'Promotions/Fashion');
  assert.equal(csvCell(365), '365');
  assert.equal(csvCell(true), 'true');
});

test('空の値は空文字にする', () => {
  assert.equal(csvCell(''), '');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
});

test('カンマを含む値は囲む', () => {
  assert.equal(csvCell('Kouki, your order'), '"Kouki, your order"');
});

test('引用符は 2 つ重ねて囲む', () => {
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
});

test('改行を含む値は囲む', () => {
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
});

test('数式として解釈される値を無害化する', () => {
  // 件名に = から始まるものがあり、取り込み直すと数式になる
  assert.equal(csvCell('=SUM(A1:A9)'), "'=SUM(A1:A9)");
  assert.equal(csvCell('+1 for this'), "'+1 for this");
  assert.equal(csvCell('-50% OFF'), "'-50% OFF");
  assert.equal(csvCell('@everyone'), "'@everyone");
});

test('無害化と囲みは両方効く', () => {
  assert.equal(csvCell('=A1,B2'), '"\'=A1,B2"');
});

test('日付は ISO で出す', () => {
  assert.equal(csvCell(new Date('2026-10-12T00:00:00Z')), '2026-10-12T00:00:00.000Z');
});

test('行の配列を CSV にする', () => {
  assert.equal(toCsv([['a', 'b'], ['c', 'd']]), 'a,b\nc,d\n');
});

test('空の表でも改行だけは出す', () => {
  assert.equal(toCsv([[]]), '\n');
});

test('log 系のシートは書き出さない', () => {
  // 10 万行あり、CSV にすると毎週 20 MB 近くになる
  assert.equal(isExportableSheet('log'), false);
  assert.equal(isExportableSheet('log_1'), false);
  assert.equal(isExportableSheet('log_archive'), false);
});

test('それ以外のシートは書き出す', () => {
  for (const name of ['labels', 'rules', 'senders', 'proposals', 'unmatched', 'config', 'backlog']) {
    assert.equal(isExportableSheet(name), true, name);
  }
});

// --- 行数の数え方 -------------------------------------------------------------

/** spec の列順どおりの index (0 始まり)。実シートを読まずに組む。 */
function indexOf(spec) {
  const index = {};
  spec.columns.forEach((column, at) => {
    index[column.key] = at;
  });
  return index;
}

/** かたまりが覆う 0 始まりの列番号。 */
function covered(blocks) {
  const columns = [];
  for (const block of blocks) {
    for (let at = 0; at < block.size; at += 1) columns.push(block.start - 1 + at);
  }
  return columns;
}

test('行数を数える範囲から数式列を除く', () => {
  // labels の full_path は開いた範囲の ARRAYFORMULA で、列末尾まで空文字を吐く。
  // ここに入れると実データ 80 行でも 2,000 行と数えてしまう (#20 と同じ理由)。
  const spec = findSheetSpec('labels');
  const index = indexOf(spec);
  const seen = covered(anchorBlocks(spec, index, spec.columns.length));

  const formula = spec.columns.filter((column) => column.type === 'formula');
  assert.ok(formula.length > 0, 'labels に数式列がある前提のテスト');
  for (const column of formula) {
    assert.equal(seen.includes(index[column.key]), false, `${column.header} が除かれていない`);
  }
});

test('行数を数える範囲からチェックボックス列を除く', () => {
  // 空行に残った FALSE を data とみなすと行数が膨らむ
  const spec = findSheetSpec('rules');
  const index = indexOf(spec);
  const seen = covered(anchorBlocks(spec, index, spec.columns.length));

  const checkbox = spec.columns.filter((column) => column.type === 'checkbox');
  assert.ok(checkbox.length > 0, 'rules にチェックボックス列がある前提のテスト');
  for (const column of checkbox) {
    assert.equal(seen.includes(index[column.key]), false, `${column.header} が除かれていない`);
  }
});

test('書き込みの範囲は数式列だけを除く', () => {
  // こちらはチェックボックスにも書く。除くのは数式列だけ
  const spec = findSheetSpec('rules');
  const index = indexOf(spec);
  const seen = covered(writableBlocks(spec, index, spec.columns.length));

  for (const column of spec.columns.filter((c) => c.type === 'checkbox')) {
    assert.equal(seen.includes(index[column.key]), true, `${column.header} に書けない`);
  }
  for (const column of spec.columns.filter((c) => c.type === 'formula')) {
    assert.equal(seen.includes(index[column.key]), false, `${column.header} を潰す`);
  }
});

test('行数を数える範囲にふつうの列は残る', () => {
  const spec = findSheetSpec('labels');
  const index = indexOf(spec);
  const seen = covered(anchorBlocks(spec, index, spec.columns.length));
  assert.equal(seen.includes(index['major']), true);
});
