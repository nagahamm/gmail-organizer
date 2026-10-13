/**
 * GAS 用のフラットな名前空間から、テスト対象の関数を取り出す。
 *
 * src/ は GAS の制約で import / export を持たない。tsc の outFile で 1 本へ
 * 連結し、その中身を関数の本体として評価して、必要なものだけ返す。
 * 読み込み順は tsc が解決するので、ここで管理しない (docs/design.md 5.4)。
 *
 * 連結は `npm test` が最初に 1 回だけ行う。型が通らないコードはそこで止まるので、
 * 型検査も兼ねている。
 */

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
  'describeProgress',
  'missingConfigDefaults',
  'cursorKeyFor',
  'describeQueryWindow',
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
  'renderDigestHtml',
  'escapeHtml',
  'parseRelayProposals',
  'buildReplyProposal',
  'buildProposalId',
  'isDuplicateProposal',
  'hasSheetSpec',
  'rowsFromTable',
  'coerceRowTypes',
  'buildDevUpdates',
  'buildDevOverwrites',
  'extractDevMailPayload',
  'isGmailQuotaExceeded',
  'sheetNameFromSubject',
  'compareField',
  'compareLabelRows',
  'compareSenderRows',
  'extractDisplayName',
  'planSenderDedup',
  'planDisplayNameRenormalization',
  'planSenderGarbageCleanup',
  'isGmailTrackingUrl',
  'nextLogArchiveNumber',
  'ruleMatchesSender',
  'computeUnruledSenderStats',
  'senderUpdates',
  'carriesOtherTypeLabel',
  'isAutoApprovable',
  'ruleExistsForPattern',
  'buildDeleteQuery',
  'hasOwnReply',
  'MENU_SPEC',
  'menuHandlerNames',
  'csvCell',
  'toCsv',
  'isExportableSheet',
  'anchorBlocks',
  'writableBlocks',
  'findSheetSpec',
];

export function load() {
  // ビルドは npm test が 1 回だけ行う。ここで走らせると、node --test が
  // テストファイルを並列に動かすぶんだけ tsc が同じ build/bundle.js を
  // 取り合い、書きかけの中身を読んでしまう。
  let source;
  try {
    source = readFileSync(BUNDLE, 'utf8');
  } catch {
    throw new Error(`${BUNDLE} がありません。node --test を直接叩かず npm test を使ってください。`);
  }
  const factory = new Function(`${source}\nreturn { ${EXPORTED.join(', ')} };`);
  return factory();
}
