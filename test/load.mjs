/**
 * GAS 用のフラットな名前空間から、テスト対象の関数を取り出す。
 *
 * src/ は GAS の制約で import / export を持たない。tsc の outFile で 1 本へ
 * 連結し、その中身を関数の本体として評価して、必要なものだけ返す。
 * 読み込み順は tsc が解決するので、ここで管理しない (docs/design.md 5.4)。
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BUNDLE = 'build/bundle.js';

/** 取り出す関数。ここに無いものはテストから見えない。 */
const EXPORTED = [
  'isRuleApplicable',
  'relaxProtection',
  'buildRuleQuery',
  'buildRetentionQuery',
  'planNextPage',
  'rollDailyUsage',
  'hasDailyBudget',
  'mergeBacklogStat',
  'buildMatchQuery',
  'sanitizeQueryValue',
  'splitLabelPath',
  'normalizeListId',
  'extractAddress',
  'senderDomain',
  'truncateSubject',
  'describeMismatch',
  'typeName',
  'allowedValues',
  'isSkipInboxCandidate',
  'percent',
  'filterIsTooNarrow',
  'isMissingColumnError',
  'isSkipProposable',
  'buildSkipProposal',
];

export function load() {
  // 型検査も兼ねる。型が通らないコードはテストにかけない。
  execFileSync('npx', ['tsc', '-p', 'tsconfig.test.json'], { stdio: 'inherit' });

  const source = readFileSync(BUNDLE, 'utf8');
  const factory = new Function(`${source}\nreturn { ${EXPORTED.join(', ')} };`);
  return factory();
}
