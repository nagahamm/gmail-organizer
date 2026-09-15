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
  relaxProtection,
  buildRuleQuery,
  buildRetentionQuery,
  planNextPage,
  rollDailyUsage,
  hasDailyBudget,
  mergeBacklogStat,
  describeProgress,
  missingConfigDefaults,
  cursorKeyFor,
  describeQueryWindow,
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
  isSkipProposable,
  buildSkipProposal,
  renderDigestHtml,
  escapeHtml,
  parseRelayProposals,
  buildReplyProposal,
  buildProposalId,
  isDuplicateProposal,
  hasSheetSpec,
  rowsFromTable,
  coerceRowTypes,
  compareLabelField,
  compareLabelRows,
  extractDisplayName,
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
    relabel: false,
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

// --- 機能: 過去メールへの遡及適用 (ページ送り) ------------------------------

test('1 ページに収まらないルールでも最後まで進む', () => {
  // 165 件が対象。1 ページ目の 100 件にラベルが付き、検索結果が 65 件に縮む。
  const first = planNextPage(0, 100, 100);
  assert.deepEqual(first, { done: false, start: 0 }, '縮んだぶんを飛び越さないよう位置を進めない');

  const second = planNextPage(0, 65, 65);
  assert.deepEqual(second, { done: false, start: 0 });

  // 残りが無くなれば 0 件が返り、そこで終わる。
  assert.deepEqual(planNextPage(0, 0, 0), { done: true, start: 0 });
});

test('同じページを読み続けない', () => {
  // 読み直しても新しいスレッドが 1 件も無い = インデックスが未反映。次の窓へ。
  assert.deepEqual(planNextPage(0, 100, 0), { done: false, start: 100 });
  assert.deepEqual(planNextPage(100, 100, 0), { done: false, start: 200 });
});

test('最後の欠けたページを読み尽くしたら終わる', () => {
  assert.deepEqual(planNextPage(100, 65, 0), { done: true, start: 165 });
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

test('保持期間を設定していなければ何も引かない (Promotions 以外)', () => {
  assert.equal(buildRetentionQuery(rule({ label: 'Finance/Cards/Jcb', inboxDays: 0 })), '');
});

test('Promotions は保持期間を設定していなくても既定の 90 日で引く', () => {
  const query = buildRetentionQuery(rule({ label: 'Promotions/Stores', inboxDays: 0 }));
  assert.equal(query, 'label:"Promotions/Stores" in:inbox older_than:90d');
});

test('Promotions でも明示した保持期間があればそちらを使う', () => {
  const query = buildRetentionQuery(rule({ label: 'Promotions/Rewards', inboxDays: 30 }));
  assert.equal(query, 'label:"Promotions/Rewards" in:inbox older_than:30d');
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

test('負の保持日数は設定なしとして扱う (Promotions 以外)', () => {
  assert.equal(buildRetentionQuery(rule({ label: 'Finance/Cards/Jcb', inboxDays: -1 })), '');
});

// --- 機能: 何日かに分けて流す -----------------------------------------------

test('1 日の上限に達したら止める', () => {
  const usage = { day: '2026-09-05', threads: 3000 };
  assert.equal(hasDailyBudget(usage, '2026-09-05', 3000), false);
});

test('上限に届いていなければ続ける', () => {
  const usage = { day: '2026-09-05', threads: 2999 };
  assert.equal(hasDailyBudget(usage, '2026-09-05', 3000), true);
});

test('日付が変われば予算は戻る', () => {
  const usage = { day: '2026-09-05', threads: 5000 };
  assert.equal(hasDailyBudget(usage, '2026-09-06', 3000), true);
});

test('日付が変われば使用量は 0 から数え直す', () => {
  const usage = { day: '2026-09-05', threads: 5000 };
  assert.deepEqual(rollDailyUsage(usage, '2026-09-06', 10), { day: '2026-09-06', threads: 10 });
});

test('同じ日なら使用量は積み上がる', () => {
  const usage = { day: '2026-09-05', threads: 100 };
  assert.deepEqual(rollDailyUsage(usage, '2026-09-05', 10), { day: '2026-09-05', threads: 110 });
});

test('張り替えと遡及で同じ 1 日分を使う', () => {
  // 数え場所は 1 つ。張り替えで使ったぶんは遡及の残りから引かれる。
  const afterRelabel = rollDailyUsage({ day: '', threads: 0 }, '2026-09-05', 2500);
  const afterRetro = rollDailyUsage(afterRelabel, '2026-09-05', 500);
  assert.equal(afterRetro.threads, 3000);
  assert.equal(hasDailyBudget(afterRetro, '2026-09-05', 3000), false);
});

test('記録の無い状態からでも数え始められる', () => {
  assert.deepEqual(rollDailyUsage({ day: '', threads: 0 }, '2026-09-05', 5), {
    day: '2026-09-05',
    threads: 5,
  });
});

// --- 機能: 過去メールの張り替え ---------------------------------------------

test('張り替えでは受信トレイから外さず既読にもしない', () => {
  const relaxed = relaxProtection(rule({ skipInbox: true, markRead: true }));
  assert.equal(relaxed.skipInbox, false);
  assert.equal(relaxed.markRead, false);
});

test('張り替えでもラベルと拠点は変えない', () => {
  const relaxed = relaxProtection(
    rule({ skipInbox: true, label: 'Promotions/Travel/Flights', location: '@AU' })
  );
  assert.equal(relaxed.label, 'Promotions/Travel/Flights');
  assert.equal(relaxed.location, '@AU');
});

test('張り替えは元のルールを書き換えない', () => {
  const original = rule({ skipInbox: true, markRead: true });
  relaxProtection(original);
  assert.equal(original.skipInbox, true);
  assert.equal(original.markRead, true);
});

test('保護を外したルールは分類済みのスレッドにも当たる', () => {
  // 保護は「除外か既読を持つルール」にしか効かない。両方落ちれば判定に入らない。
  const relaxed = relaxProtection(rule({ skipInbox: true, markRead: true }));
  assert.equal(relaxed.skipInbox || relaxed.markRead, false);
});

test('張り替えでも行の位置と累計は保つ', () => {
  const relaxed = relaxProtection(rule({ rowNumber: 42, matchCount: 7, relabel: true }));
  assert.equal(relaxed.rowNumber, 42);
  assert.equal(relaxed.matchCount, 7);
  assert.equal(relaxed.relabel, true);
});

// --- 機能: 対象期間の表示 ---------------------------------------------------

test('空欄は全期間と読ませる', () => {
  // 空白のまま出すと、設定し忘れなのか全期間なのか読み手に分からない。
  assert.equal(describeQueryWindow(''), '全期間');
});

test('空白だけでも全期間として扱う', () => {
  assert.equal(describeQueryWindow('   '), '全期間');
});

test('設定があればそのまま見せる', () => {
  assert.equal(describeQueryWindow('newer_than:1y'), 'newer_than:1y');
});

// --- 機能: ドライランの再開位置 ---------------------------------------------

test('ドライランの中断が本適用の再開位置を汚さない', () => {
  assert.notEqual(cursorKeyFor('RETRO_CURSOR', true), cursorKeyFor('RETRO_CURSOR', false));
});

test('本適用は素の鍵を使う', () => {
  assert.equal(cursorKeyFor('RETRO_CURSOR', false), 'RETRO_CURSOR');
});

test('張り替えと遡及でも鍵は分かれる', () => {
  assert.notEqual(cursorKeyFor('RETRO_CURSOR', true), cursorKeyFor('RELABEL_CURSOR', true));
});

// --- 機能: 設定の追随 -------------------------------------------------------

const configDefaults = [
  ['DRY_RUN', 'TRUE', '説明'],
  ['RETRO_QUERY_WINDOW', 'newer_than:1y', '説明'],
  ['DAILY_THREAD_BUDGET', '3000', '説明'],
];

test('あとから増えた設定だけを足す', () => {
  const missing = missingConfigDefaults(['DRY_RUN', 'RETRO_QUERY_WINDOW'], configDefaults);
  assert.deepEqual(missing.map((row) => row[0]), ['DAILY_THREAD_BUDGET']);
});

test('すべて揃っていれば何も足さない', () => {
  const present = ['DRY_RUN', 'RETRO_QUERY_WINDOW', 'DAILY_THREAD_BUDGET'];
  assert.deepEqual(missingConfigDefaults(present, configDefaults), []);
});

test('見に覚えのない設定があっても足す判断は変わらない', () => {
  // SAMPLE_LIMIT のように、使われなくなって残っている行がある。
  const present = ['DRY_RUN', 'SAMPLE_LIMIT'];
  assert.deepEqual(missingConfigDefaults(present, configDefaults).map((row) => row[0]), [
    'RETRO_QUERY_WINDOW',
    'DAILY_THREAD_BUDGET',
  ]);
});

test('空のシートには全部足す', () => {
  assert.equal(missingConfigDefaults([], configDefaults).length, 3);
});

test('前後の空白があっても同じキーとみなす', () => {
  assert.deepEqual(missingConfigDefaults([' DRY_RUN '], configDefaults).map((row) => row[0]), [
    'RETRO_QUERY_WINDOW',
    'DAILY_THREAD_BUDGET',
  ]);
});

// --- 機能: 実行の状態 -------------------------------------------------------

function progress(overrides = {}) {
  return {
    day: '2026-09-05',
    usedToday: 0,
    dailyBudget: 3000,
    retro: null,
    relabel: null,
    backlog: null,
    backlogDomains: 0,
    ...overrides,
  };
}

test('中断中の処理があるか分かる', () => {
  const lines = describeProgress(progress({ retro: { ruleIndex: 11, start: 300 } }));
  assert.ok(lines.some((line) => line.indexOf('遡及適用: 中断中') >= 0));
  assert.ok(lines.some((line) => line.indexOf('12 本目のルール、位置 300') >= 0));
});

test('今日どれだけ使ったか分かる', () => {
  const lines = describeProgress(progress({ usedToday: 1234 }));
  assert.ok(lines.some((line) => line.indexOf('今日の使用量: 1234 / 3000 スレッド') >= 0));
});

test('何も動いていなければそう分かる', () => {
  const lines = describeProgress(progress());
  assert.ok(lines.some((line) => line.indexOf('中断中の処理はありません') >= 0));
});

test('洗い出しの中断は位置だけを出す', () => {
  const lines = describeProgress(progress({ backlog: { ruleIndex: 0, start: 2000 } }));
  assert.ok(lines.some((line) => line.indexOf('洗い出し: 中断中 (位置 2000)') >= 0));
});

test('中断中が複数あればどちらも出る', () => {
  const lines = describeProgress(
    progress({ retro: { ruleIndex: 0, start: 0 }, relabel: { ruleIndex: 2, start: 100 } })
  );
  assert.ok(lines.some((line) => line.indexOf('遡及適用: 中断中') >= 0));
  assert.ok(lines.some((line) => line.indexOf('張り替え: 中断中') >= 0));
});

test('backlog シートがまだ無ければそう出す', () => {
  // コードを push しただけの時点ではシートが無い。ここで落とすとダイジェストごと死ぬ。
  const lines = describeProgress(progress({ backlogDomains: null }));
  assert.ok(lines.some((line) => line.indexOf('backlog: 未作成') >= 0));
});

test('完了予定は出さない', () => {
  // 1 日に進む量は対象の密度で変わる。外れた予測は「止まっている」の誤認を生む。
  const text = describeProgress(progress({ retro: { ruleIndex: 0, start: 0 } })).join('\n');
  assert.equal(/残り|完了予定|あと[0-9]/.test(text), false);
});

// --- 機能: 過去の未分類の洗い出し -------------------------------------------

function stat(overrides = {}) {
  return {
    domain: 'example.com',
    address: 'news@example.com',
    listId: '',
    count: 1,
    firstSeen: new Date('2025-03-01'),
    lastSeen: new Date('2025-03-01'),
    sampleSubject: '件名',
    ...overrides,
  };
}

test('初めて見たドメインはそのまま入る', () => {
  const incoming = stat();
  assert.deepEqual(mergeBacklogStat(null, incoming), incoming);
});

test('同じドメインの件数は足し合わせる', () => {
  const merged = mergeBacklogStat(stat({ count: 10 }), stat({ count: 3 }));
  assert.equal(merged.count, 13);
});

test('期間は広がる方へ寄せる', () => {
  const merged = mergeBacklogStat(
    stat({ firstSeen: new Date('2025-03-01'), lastSeen: new Date('2025-06-01') }),
    stat({ firstSeen: new Date('2024-01-01'), lastSeen: new Date('2026-01-01') })
  );
  assert.equal(merged.firstSeen.toISOString(), new Date('2024-01-01').toISOString());
  assert.equal(merged.lastSeen.toISOString(), new Date('2026-01-01').toISOString());
});

test('期間は狭まらない', () => {
  const merged = mergeBacklogStat(
    stat({ firstSeen: new Date('2024-01-01'), lastSeen: new Date('2026-01-01') }),
    stat({ firstSeen: new Date('2025-03-01'), lastSeen: new Date('2025-06-01') })
  );
  assert.equal(merged.firstSeen.toISOString(), new Date('2024-01-01').toISOString());
  assert.equal(merged.lastSeen.toISOString(), new Date('2026-01-01').toISOString());
});

test('代表は先に入ったものを残す', () => {
  // 実行を跨ぐたびに代表が入れ替わると、シートを見ている人が落ち着かない。
  const merged = mergeBacklogStat(
    stat({ address: 'first@example.com', sampleSubject: '最初の件名' }),
    stat({ address: 'later@example.com', sampleSubject: 'あとの件名' })
  );
  assert.equal(merged.address, 'first@example.com');
  assert.equal(merged.sampleSubject, '最初の件名');
});

test('空だった list_id は後から埋まる', () => {
  const merged = mergeBacklogStat(stat({ listId: '' }), stat({ listId: 'news.example.com' }));
  assert.equal(merged.listId, 'news.example.com');
});

// --- 機能: 週次ダイジェスト (受信トレイ除外の候補) --------------------------

test('読んでいない送信元を受信トレイ除外の候補にする', () => {
  const stat = { category: 'promotions', count: 10, unread: 10 };
  assert.equal(isSkipInboxCandidate(stat), true);
});

test('メインに入るものも候補にする', () => {
  const stat = { category: '(なし)', count: 10, unread: 10 };
  assert.equal(isSkipInboxCandidate(stat), true);
});

test('読んでいるものは候補にしない', () => {
  const stat = { category: 'promotions', count: 10, unread: 3 };
  assert.equal(isSkipInboxCandidate(stat), false);
});

test('メインでも読んでいるものは候補にしない', () => {
  const stat = { category: '(なし)', count: 10, unread: 3 };
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

// --- 機能: 受信トレイ除外の提案 ---------------------------------------------

/** unmatched の 1 行。 */
function unmatchedRow(overrides = {}) {
  return {
    _rowNumber: 2,
    from: 'hello@smileie.au',
    category: 'promotions',
    count7d: 12,
    unreadRate: '100%',
    skipInboxCandidate: true,
    proposed: false,
    ...overrides,
  };
}

test('除外候補を提案に立てる', () => {
  assert.equal(isSkipProposable(unmatchedRow()), true);
});

test('除外候補でないものは提案しない', () => {
  assert.equal(isSkipProposable(unmatchedRow({ skipInboxCandidate: false })), false);
});

test('同じ送信元を繰り返し提案しない', () => {
  assert.equal(isSkipProposable(unmatchedRow({ proposed: true })), false);
});

test('送信元が空なら提案しない', () => {
  assert.equal(isSkipProposable(unmatchedRow({ from: '  ' })), false);
});

test('根拠にカテゴリと件数と未読率が入る', () => {
  const proposal = buildSkipProposal(unmatchedRow(), 'smileie.au', new Date());
  assert.match(proposal.rationale, /promotions/);
  assert.match(proposal.rationale, /12 件/);
  assert.match(proposal.rationale, /100%/);
});

test('どのラベルへ入れるかは決めない', () => {
  const proposal = buildSkipProposal(unmatchedRow(), 'smileie.au', new Date());
  assert.equal(proposal.label, 'Promotions');
  assert.match(proposal.comment, /プルダウンで直して/);
});

test('提案はドメインで引くルールになる', () => {
  const proposal = buildSkipProposal(unmatchedRow(), 'smileie.au', new Date());
  assert.equal(proposal.kind, 'inbox_skip');
  assert.equal(proposal.matchKind, 'from_domain');
  assert.equal(proposal.pattern, 'smileie.au');
  assert.equal(proposal.approval, '未確認');
});

// --- 機能: 返信メールによるルール提案 -------------------------------------------

function relayBody(items) {
  return [
    '本文の前置き',
    'GMAIL_ORGANIZER_PROPOSALS_BEGIN',
    JSON.stringify(items),
    'GMAIL_ORGANIZER_PROPOSALS_END',
    '本文の後書き',
  ].join('\n');
}

test('返信の自由文がルール提案になる', () => {
  const body = relayBody([
    {
      matchKind: 'from',
      pattern: 'test@gmail.com',
      label: 'Promotions/A',
      rationale: '返信より',
      summary: 'test@gmail.com → Promotions/A',
      sourceQuote: 'test@gmail.comはpromotion/aへ',
    },
  ]);

  const [parsed] = parseRelayProposals(body);
  const proposal = buildReplyProposal(parsed, new Date());

  assert.equal(proposal.kind, 'new_rule');
  assert.equal(proposal.matchKind, 'from');
  assert.equal(proposal.pattern, 'test@gmail.com');
  assert.equal(proposal.label, 'Promotions/A');
  assert.equal(proposal.approval, '未確認');
  assert.match(proposal.comment, /test@gmail\.comはpromotion\/aへ/);
});

test('rationale/summary/sourceQuote が空でも提案は作れる', () => {
  const body = relayBody([{ matchKind: 'from_domain', pattern: 'example.com', label: 'Promotions' }]);
  const [parsed] = parseRelayProposals(body);
  const proposal = buildReplyProposal(parsed, new Date());

  assert.equal(proposal.rationale, '返信メールでの指示');
  assert.match(proposal.summary, /example\.com/);
  assert.match(proposal.comment, /起票しました/);
});

test('ルールとして読み取れない返信は無視する', () => {
  assert.deepEqual(parseRelayProposals('雑談だけの本文です'), []);
});

test('境界だけあって中身が壊れている場合も無視する', () => {
  assert.deepEqual(parseRelayProposals(relayBody('{ 壊れた json')), []);
});

test('配列内の不備な要素だけを個別に落とす', () => {
  const body = relayBody([
    { matchKind: 'from', pattern: 'ok@example.com', label: 'Promotions/A' },
    { matchKind: 'no_such_kind', pattern: 'bad@example.com', label: 'Promotions/B' },
    { matchKind: 'from', pattern: '', label: 'Promotions/C' },
    { matchKind: 'from', pattern: 'no-label@example.com' },
  ]);

  const parsed = parseRelayProposals(body);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].pattern, 'ok@example.com');
});

test('同じ指示からは毎回同じ提案IDが作られる', () => {
  const proposal = { matchKind: 'from', pattern: 'test@gmail.com', label: 'Promotions/A' };
  assert.equal(buildProposalId(proposal), buildProposalId({ ...proposal }));
});

test('同じ返信を二重に取り込まない', () => {
  const proposal = { matchKind: 'from', pattern: 'test@gmail.com', label: 'Promotions/A' };
  const existingIds = [buildProposalId(proposal)];
  assert.equal(isDuplicateProposal(existingIds, proposal), true);
});

test('別の指示は二重とみなさない', () => {
  const proposal = { matchKind: 'from', pattern: 'test@gmail.com', label: 'Promotions/A' };
  const other = { matchKind: 'from', pattern: 'other@example.com', label: 'Promotions/A' };
  assert.equal(isDuplicateProposal([buildProposalId(other)], proposal), false);
});

// --- 機能: 週次ダイジェスト (HTML 整形) ---------------------------------------

test('先頭行は表題になる', () => {
  const html = renderDigestHtml(['gmail-organizer 週次ダイジェスト']);
  assert.match(html, /<h2[^>]*>gmail-organizer 週次ダイジェスト<\/h2>/);
});

test('■ で始まる行は見出しになる', () => {
  const html = renderDigestHtml(['表題', '■ 未分類の送信元 上位 3 件']);
  assert.match(html, /<h3[^>]*>未分類の送信元 上位 3 件<\/h3>/);
});

test('2 マス下げた行は箇条書きになる', () => {
  const html = renderDigestHtml(['表題', '■ 見出し', '  1 行目', '  2 行目']);
  assert.match(html, /<ul[^>]*><li[^>]*>1 行目<\/li>\n<li[^>]*>2 行目<\/li><\/ul>|<li[^>]*>1 行目<\/li>/);
  assert.match(html, /<li[^>]*>2 行目<\/li>/);
});

test('空行で箇条書きが区切られる', () => {
  const html = renderDigestHtml(['表題', '■ 見出し', '  項目', '', '次の段落']);
  const listEnd = html.indexOf('</ul>');
  const paragraph = html.indexOf('<p');
  assert.ok(listEnd > 0 && paragraph > listEnd);
});

test('件数は間引かれず全件そのまま出る', () => {
  const rows = Array.from({ length: 30 }, (_, i) => `  行 ${i + 1}`);
  const html = renderDigestHtml(['表題', '■ 未分類の送信元 上位 30 件', ...rows]);
  for (const row of rows) assert.match(html, new RegExp(`<li[^>]*>${row.trim()}</li>`));
});

test('件名などに含まれる記号はエスケープする', () => {
  assert.equal(escapeHtml('<script>&"\''), '&lt;script&gt;&amp;&quot;&#39;');
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

test('全角の装飾記号(＜＞)で囲まれた表示名は剥がす', () => {
  assert.equal(extractDisplayName('＜ユニクロ＞ <no-reply@ml.store.uniqlo.com>'), 'ユニクロ');
});

test('全角の【】で囲まれた表示名も剥がす', () => {
  assert.equal(extractDisplayName('【ヨドバシ】 <info@yodobashi.com>'), 'ヨドバシ');
});

test('装飾記号が無い表示名はそのまま', () => {
  assert.equal(extractDisplayName('Team Rugby <reply@e.rugby.com.au>'), 'Team Rugby');
});

test('全角英字は半角に揃える', () => {
  assert.equal(extractDisplayName('ＳＢＩ証券 <info@sbisec.co.jp>'), 'SBI 証券');
});

test('全角スペースは半角に揃える', () => {
  assert.equal(extractDisplayName('野田　眞之介 <s-noda@r-agent.com>'), '野田 眞之介');
});

test('株式会社は法人格の表記ゆれとして落とす', () => {
  assert.equal(extractDisplayName('株式会社ＳＢＩ証券 <info@sbisec.co.jp>'), 'SBI 証券');
});

test('半角英数字の直後に日本語が続く場合はスペースを入れる', () => {
  assert.equal(extractDisplayName('povo2.0運営事務局 <info@povo.jp>'), 'povo2.0 運営事務局');
});

test('日本語の直後に英字が続く合成語はそのまま残す', () => {
  assert.equal(
    extractDisplayName('スタディサプリENGLISHお問い合わせ窓口(送信専用) <no-reply@example.com>'),
    'スタディサプリENGLISH お問い合わせ窓口(送信専用)'
  );
});

test('元から半角の会社名は変えない', () => {
  assert.equal(extractDisplayName('Uber Eats <noreply@uber.com>'), 'Uber Eats');
  assert.equal(extractDisplayName('freee <no-reply@freee.co.jp>'), 'freee');
});

// --- 機能: labelsの並び順 ----------------------------------------------------

function labelRow(overrides = {}) {
  return { major: '', middle: '', minor: '', ...overrides };
}

test('大項目のABC順で比較する', () => {
  assert.ok(compareLabelRows(labelRow({ major: 'Finance' }), labelRow({ major: 'Promotions' })) < 0);
});

test('大項目が同じなら中項目で比較する', () => {
  assert.ok(
    compareLabelRows(
      labelRow({ major: 'Finance', middle: 'Accounts' }),
      labelRow({ major: 'Finance', middle: 'Bills' })
    ) < 0
  );
});

test('大項目・中項目が同じなら小項目で比較する', () => {
  assert.ok(
    compareLabelRows(
      labelRow({ major: 'Finance', middle: 'Cards', minor: 'Jcb' }),
      labelRow({ major: 'Finance', middle: 'Cards', minor: 'Rakuten' })
    ) < 0
  );
});

test('完全に同じ組み合わせなら0を返す', () => {
  assert.equal(compareLabelRows(labelRow({ major: 'Finance' }), labelRow({ major: 'Finance' })), 0);
});

test('空欄も文字列として比較できる', () => {
  assert.equal(compareLabelField(undefined, ''), 0);
});

// --- 開発用データ投入 -------------------------------------------------------

test('定義済みのシート名だけ取り込む', () => {
  assert.equal(hasSheetSpec('proposals'), true);
  assert.equal(hasSheetSpec('no_such_sheet'), false);
});

test('CSVのヘッダをkeyにしてRowへ変換する', () => {
  const rows = rowsFromTable([
    ['proposalId', 'kind', 'label'],
    ['seed-1', 'new_rule', 'Promotions/A'],
    ['seed-2', 'new_rule', 'Promotions/B'],
  ]);
  assert.deepEqual(rows, [
    { proposalId: 'seed-1', kind: 'new_rule', label: 'Promotions/A' },
    { proposalId: 'seed-2', kind: 'new_rule', label: 'Promotions/B' },
  ]);
});

test('ヘッダ行しか無ければ空になる', () => {
  assert.deepEqual(rowsFromTable([['proposalId', 'kind']]), []);
});

test('空のヘッダ列は無視する', () => {
  const rows = rowsFromTable([
    ['proposalId', '', 'label'],
    ['seed-1', 'メモ書き', 'Promotions/A'],
  ]);
  assert.deepEqual(rows, [{ proposalId: 'seed-1', label: 'Promotions/A' }]);
});

function fixtureSpec() {
  return {
    name: 'fixture',
    note: '',
    columns: [
      { key: 'enabled', header: '有効', type: 'checkbox' },
      { key: 'priority', header: '優先度', type: 'number' },
      { key: 'pattern', header: 'パターン' },
    ],
  };
}

test('CSVの"TRUE"/"FALSE"文字列をチェックボックス列では真偽値にする', () => {
  const row = coerceRowTypes({ enabled: 'TRUE', priority: '50', pattern: 'a@example.com' }, fixtureSpec());
  assert.equal(row.enabled, true);
});

test('小文字のfalseも真偽値にする', () => {
  const row = coerceRowTypes({ enabled: 'false', priority: '50', pattern: 'a@example.com' }, fixtureSpec());
  assert.equal(row.enabled, false);
});

test('数値列の文字列は数値にする', () => {
  const row = coerceRowTypes({ enabled: 'TRUE', priority: '50', pattern: 'a@example.com' }, fixtureSpec());
  assert.equal(row.priority, 50);
  assert.equal(typeof row.priority, 'number');
});

test('typeが無い列(文字列)は変換しない', () => {
  const row = coerceRowTypes({ enabled: 'TRUE', priority: '50', pattern: 'a@example.com' }, fixtureSpec());
  assert.equal(row.pattern, 'a@example.com');
});

test('空文字は変換せずそのまま残す', () => {
  const row = coerceRowTypes({ enabled: '', priority: '', pattern: '' }, fixtureSpec());
  assert.equal(row.enabled, '');
  assert.equal(row.priority, '');
});
