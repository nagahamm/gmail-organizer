/**
 * docs/requirements.md のシナリオのうち、GAS API に触れずに検証できるものを回す。
 *
 * テスト名はシナリオ名と揃える。要件を直したらここも直す、が分かるようにするため。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const {
  isRuleApplicable,
  buildRuleQuery,
  buildRetentionQuery,
  buildMatchQuery,
  sanitizeQueryValue,
  splitLabelPath,
  normalizeListId,
  extractAddress,
  senderDomain,
  truncateSubject,
  describeMismatch,
  typeName,
  allowedValues,
  isSkipInboxCandidate,
  percent,
  filterIsTooNarrow,
  isMissingColumnError,
} = load();

const NOW = new Date('2026-09-01T00:00:00Z');

/** 有効な最小のルール。テストごとに必要な項目だけ上書きする。 */
function rule(overrides = {}) {
  return {
    ruleId: 'r1',
    rowNumber: 2,
    enabled: true,
    priority: 100,
    kind: 'from_domain',
    pattern: 'example.com',
    label: 'Promotions/Stores',
    location: '',
    skipInbox: false,
    markRead: false,
    star: false,
    neverSpam: false,
    frozenAt: null,
    inboxDays: 0,
    matchCount: 0,
    ...overrides,
  };
}

// --- 機能: 凍結したルール ---------------------------------------------------

test('凍結したルールは新着に適用されない', () => {
  const frozen = rule({ frozenAt: new Date('2026-08-01T00:00:00Z') });
  assert.equal(isRuleApplicable(frozen, NOW, false), false);
});

test('凍結したルールも遡及には適用される', () => {
  const frozen = rule({ frozenAt: new Date('2026-08-01T00:00:00Z') });
  assert.equal(isRuleApplicable(frozen, NOW, true), true);
});

test('凍結日が未来ならまだ新着に適用される', () => {
  const later = rule({ frozenAt: new Date('2026-10-01T00:00:00Z') });
  assert.equal(isRuleApplicable(later, NOW, false), true);
});

test('無効なルールは遡及でも適用されない', () => {
  assert.equal(isRuleApplicable(rule({ enabled: false }), NOW, true), false);
});

test('ラベルも拠点も無いルールは適用されない', () => {
  assert.equal(isRuleApplicable(rule({ label: '', location: '' }), NOW, false), false);
});

test('拠点だけのルールは適用される', () => {
  assert.equal(isRuleApplicable(rule({ label: '', location: '@AU' }), NOW, false), true);
});

// --- 機能: 新着メールの自動振り分け (検索式の組み立て) ----------------------

test('List-Id は list: 演算子で引く', () => {
  assert.equal(buildMatchQuery('list_id', 'news.example.com'), 'list:(news.example.com)');
});

test('from と subject はそれぞれの演算子になる', () => {
  assert.equal(buildMatchQuery('from', 'a@example.com'), 'from:(a@example.com)');
  assert.equal(buildMatchQuery('from_domain', 'example.com'), 'from:(example.com)');
  assert.equal(buildMatchQuery('subject', '認証コード'), 'subject:(認証コード)');
});

test('query は素通しする', () => {
  assert.equal(buildMatchQuery('query', 'has:attachment older_than:1y'), 'has:attachment older_than:1y');
});

test('パターンが空なら適用しない', () => {
  assert.equal(isRuleApplicable(rule({ pattern: '  ' }), NOW, true), false);
});

test('付与先のラベルが既に付いているものは検索から除く', () => {
  const query = buildRuleQuery(rule({ label: 'Promotions/Stores' }), 'newer_than:2d');
  assert.match(query, /-label:"Promotions\/Stores"/);
  assert.match(query, /newer_than:2d/);
});

test('パターンが空のルールは検索式にならない', () => {
  assert.equal(buildRuleQuery(rule({ pattern: '   ' }), 'newer_than:2d'), '');
});

test('検索式に入る二重引用符と改行は落とす', () => {
  assert.equal(sanitizeQueryValue('a"b\nc'), 'a b c');
});

// --- 機能: 既読化と受信トレイの保持 -----------------------------------------

test('保持期間を過ぎたスレッドを引く', () => {
  const query = buildRetentionQuery(rule({ label: 'Finance/Cards/Jcb', inboxDays: 30 }));
  assert.equal(query, 'label:"Finance/Cards/Jcb" in:inbox older_than:30d');
});

test('保持期間を設定していなければ何も引かない', () => {
  assert.equal(buildRetentionQuery(rule({ inboxDays: 0 })), '');
});

test('無効なルールでは何も引かない', () => {
  assert.equal(buildRetentionQuery(rule({ enabled: false, inboxDays: 30 })), '');
});

test('ラベルが無いルールでは何も引かない', () => {
  assert.equal(buildRetentionQuery(rule({ label: '', location: '@AU', inboxDays: 30 })), '');
});

test('保持日数は整数に丸める', () => {
  const query = buildRetentionQuery(rule({ label: 'X', inboxDays: 30.7 }));
  assert.match(query, /older_than:30d/);
});

test('負の保持日数は設定なしとして扱う', () => {
  assert.equal(buildRetentionQuery(rule({ inboxDays: -1 })), '');
});

// --- 機能: 週次ダイジェスト (受信トレイ除外の候補) --------------------------

test('Gmail の分類を受信トレイ除外の根拠にする', () => {
  const stat = { category: 'promotions', count: 10, unread: 10 };
  assert.equal(isSkipInboxCandidate(stat), true);
});

test('どのタブにも入らないものは除外候補にしない', () => {
  const stat = { category: '(なし)', count: 10, unread: 10 };
  assert.equal(isSkipInboxCandidate(stat), false);
});

test('読んでいるものは除外候補にしない', () => {
  const stat = { category: 'promotions', count: 10, unread: 3 };
  assert.equal(isSkipInboxCandidate(stat), false);
});

test('新着タブも除外候補になりうる', () => {
  const stat = { category: 'updates', count: 5, unread: 5 };
  assert.equal(isSkipInboxCandidate(stat), true);
});

test('母数が 0 なら割合は空文字', () => {
  assert.equal(percent(0, 0), '');
  assert.equal(percent(1, 4), '25%');
});

// --- 機能: 列がまだ無いときの自動回復 ---------------------------------------

test('列不足のエラーを見分ける', () => {
  const message = 'シート "rules" に列がありません: 受信トレイ保持日数。setup() を実行してください。';
  assert.equal(isMissingColumnError(message), true);
});

test('シートごと無い場合は列不足ではない', () => {
  assert.equal(isMissingColumnError('シート "rules" がありません。setup() を実行してください。'), false);
});

test('無関係な失敗は列不足ではない', () => {
  assert.equal(isMissingColumnError('Service invoked too many times for one day: gmail.'), false);
});

// --- 機能: シートの検査 (フィルタ範囲) --------------------------------------

test('列が増えていればフィルタを作り直す', () => {
  assert.equal(filterIsTooNarrow(16, 2001, 17, 2001), true);
});

test('行が足りなければフィルタを作り直す', () => {
  assert.equal(filterIsTooNarrow(17, 500, 17, 2001), true);
});

test('範囲が足りていれば作り直さない', () => {
  assert.equal(filterIsTooNarrow(17, 2001, 17, 2001), false);
});

test('範囲が広すぎる分には作り直さない', () => {
  assert.equal(filterIsTooNarrow(20, 3000, 17, 2001), false);
});

// --- 機能: シートの検査 -----------------------------------------------------

test('列の型に合わない値を報告する', () => {
  const detail = describeMismatch({ type: 'number' }, '100', null);
  assert.match(detail, /数値の列に string/);
});

test('型が合っていれば何も報告しない', () => {
  assert.equal(describeMismatch({ type: 'number' }, 100, null), '');
});

test('日付の列に文字列が入っていれば報告する', () => {
  assert.match(describeMismatch({ type: 'date' }, '2026-09-01', null), /日付の列に string/);
});

test('チェックボックスの列に文字列が入っていれば報告する', () => {
  assert.match(describeMismatch({ type: 'checkbox' }, 'TRUE', null), /チェックボックスの列に string/);
});

test('選択肢にない値を報告する', () => {
  const detail = describeMismatch({}, 'unknown', ['active', 'archived']);
  assert.match(detail, /選択肢にない値です/);
  assert.match(detail, /active \/ archived/);
});

test('選択肢に含まれていれば報告しない', () => {
  assert.equal(describeMismatch({}, 'active', ['active', 'archived']), '');
});

test('日付は date として判定される', () => {
  assert.equal(typeName(new Date()), 'date');
  assert.equal(typeName(1), 'number');
  assert.equal(typeName(true), 'boolean');
  assert.equal(typeName('x'), 'string');
});

test('ラベルを指す列は選択肢での検査対象にしない', () => {
  assert.equal(allowedValues('labelPath'), null);
  assert.notEqual(allowedValues('labelState'), null);
});

// --- 機能: 守ること (記録に残さないもの) ------------------------------------

test('件名は先頭 60 文字までしか残らない', () => {
  const long = 'あ'.repeat(100);
  const kept = truncateSubject(long);
  assert.equal(kept.length, 61); // 60 文字 + 省略記号
  assert.ok(kept.endsWith('…'));
});

test('短い件名はそのまま残る', () => {
  assert.equal(truncateSubject('注文の確認'), '注文の確認');
});

test('件名の改行と連続空白は 1 つにまとめる', () => {
  assert.equal(truncateSubject(' 注文\n の  確認 '), '注文 の 確認');
});

// --- 機能: ラベルの階層 -----------------------------------------------------

test('ラベル名を 3 階層に分解する', () => {
  assert.deepEqual(splitLabelPath('Finance/Cards/Rakuten'), {
    major: 'Finance',
    middle: 'Cards',
    minor: 'Rakuten',
  });
});

test('階層が浅いラベルは下位が空になる', () => {
  assert.deepEqual(splitLabelPath('@AU'), { major: '@AU', middle: '', minor: '' });
});

// --- 送信元の読み取り -------------------------------------------------------

test('表示名付きの送信元からアドレスを取り出す', () => {
  assert.equal(extractAddress('Team Rugby <reply@e.rugby.com.au>'), 'reply@e.rugby.com.au');
});

test('送信元からドメインを取り出す', () => {
  assert.equal(senderDomain('Team Rugby <reply@e.rugby.com.au>'), 'e.rugby.com.au');
});

test('List-Id から識別子だけを取り出す', () => {
  assert.equal(normalizeListId('Example News <news.example.com>'), 'news.example.com');
});
