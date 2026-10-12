/**
 * メニューの不変条件を見る。
 *
 * GAS は存在しない関数名を指した項目をクリックしても**静かに失敗する**。
 * 気づく手がかりが無いので、ここだけは機械で見る。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { load } from './load.mjs';

const { MENU_SPEC, menuHandlerNames } = load();

/** src/ の中で定義されている関数名。 */
function definedFunctions() {
  const names = new Set();
  for (const file of readdirSync('src').filter((name) => name.endsWith('.ts'))) {
    const source = readFileSync(`src/${file}`, 'utf8');
    for (const match of source.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)) {
      names.add(match[1]);
    }
  }
  return names;
}

test('メニューの項目は全て実在する関数を指している', () => {
  const defined = definedFunctions();
  const missing = menuHandlerNames(MENU_SPEC).filter((name) => !defined.has(name));
  assert.deepEqual(missing, [], `src/ に定義が無い関数を指しています: ${missing.join(', ')}`);
});

test('同じ関数を 2 箇所から呼んでいない', () => {
  const names = menuHandlerNames(MENU_SPEC);
  const seen = new Set();
  const duplicated = names.filter((name) => (seen.has(name) ? true : (seen.add(name), false)));
  assert.deepEqual(duplicated, [], `重複している項目: ${duplicated.join(', ')}`);
});

test('開発用のデータ投入はメニューに載せない', () => {
  // CLAUDE.md: 使い切りの操作はメニューに登録せず、エディタから直接呼ぶ
  const labels = MENU_SPEC.flatMap((group) => group.entries.map((entry) => entry.label));
  const handlers = menuHandlerNames(MENU_SPEC);

  assert.equal(
    labels.some((label) => label.includes('開発用')),
    false
  );
  assert.equal(
    handlers.some((name) => name.startsWith('menuImportDev')),
    false
  );
});

test('トップレベルの項目数を抑えている', () => {
  const top = MENU_SPEC.filter((group) => !group.title);
  const count = top.reduce((total, group) => total + group.entries.length, 0);
  // 関数ごとに項目を足していた頃は 15 個あった。束に対応させた以上、増やさない。
  assert.ok(count <= 8, `トップレベルが ${count} 項目あります`);
});

test('どのまとまりも空ではない', () => {
  for (const group of MENU_SPEC) {
    assert.ok(group.entries.length > 0, `空のまとまり: ${group.title || '(トップレベル)'}`);
  }
});

test('ラベルが重複していない', () => {
  const labels = MENU_SPEC.flatMap((group) => group.entries.map((entry) => entry.label));
  assert.equal(new Set(labels).size, labels.length);
});
