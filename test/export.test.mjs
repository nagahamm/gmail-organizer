/**
 * CSV の組み立てを検証する。
 *
 * 書き出した CSV は devSeed.ts で取り込み直せる。壊れた CSV を作ると
 * そのままシートへ戻るので、エスケープはここで固定する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { csvCell, toCsv, isExportableSheet } = load();

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
