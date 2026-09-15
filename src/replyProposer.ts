/**
 * 返信メールの中継内容を proposals へ書き込む。
 *
 * Claude の週次 Routine は Google Drive の制約でシートに直接書けないため
 * (`docs/design.md` 5.3)、固定件名の中継メールで結果を送ってくる。ここはその
 * 中継メールを読み、`proposals` へ変換して書き込む側 (`docs/design.md` 5.6)。
 *
 * rules への反映はしない。既存の承認プルダウン (proposals.ts) を必ず経由させる。
 */

/** 中継メールの件名。固定。Routine のプロンプトとここでしか使わないので二重管理はしない。 */
const RELAY_SUBJECT = '[gmail-organizer] メール提案中継';

/** 処理済みの中継メールに付ける印。二重取り込みを防ぐ。 */
const RELAY_PROCESSED_LABEL = 'gmail-organizer/relay-processed';

/** 中継メール本文に埋め込まれた JSON を取り出す境界。 */
const RELAY_BEGIN = 'GMAIL_ORGANIZER_PROPOSALS_BEGIN';
const RELAY_END = 'GMAIL_ORGANIZER_PROPOSALS_END';

/** 中継メール 1 件分の指示。Routine が構造化した結果そのもの。 */
interface RelayProposal {
  matchKind: MatchKind;
  pattern: string;
  label: string;
  rationale: string;
  summary: string;
  sourceQuote: string;
}

/**
 * 中継メール本文から提案の配列を取り出す。
 *
 * 壊れた要素は個別に落とし、読み取れた分だけ使う。1 通に複数件の指示が
 * 混ざっていても、1 件の不備でまとめて捨てない。
 *
 * GAS API に触れないので npm test で検証できる。
 */
function parseRelayProposals(body: string): RelayProposal[] {
  const text = String(body || '');
  const start = text.indexOf(RELAY_BEGIN);
  const end = text.indexOf(RELAY_END);
  if (start < 0 || end < 0 || end < start) return [];

  const jsonText = text.slice(start + RELAY_BEGIN.length, end).trim();
  if (jsonText === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(isValidRelayProposal);
}

/** 1 件の要素が proposals へ変換してよい形かを確かめる。 */
function isValidRelayProposal(value: unknown): value is RelayProposal {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;

  if (MATCH_KINDS.indexOf(candidate.matchKind as MatchKind) < 0) return false;
  if (typeof candidate.pattern !== 'string' || candidate.pattern.trim() === '') return false;
  if (typeof candidate.label !== 'string' || candidate.label.trim() === '') return false;
  return true;
}

/** 同じ指示から毎回同じ ID を作る。二重取り込みの検出に使う。 */
function buildProposalId(proposal: RelayProposal): string {
  return `reply-${proposal.matchKind}-${proposal.pattern.trim()}`;
}

/** すでに同じ提案が proposals にあるか。 */
function isDuplicateProposal(existingIds: string[], proposal: RelayProposal): boolean {
  return existingIds.indexOf(buildProposalId(proposal)) >= 0;
}

/** 1 件の指示を proposals の行にする。 */
function buildReplyProposal(proposal: RelayProposal, at: Date): Row {
  const rationale = String(proposal.rationale || '').trim();
  const summary = String(proposal.summary || '').trim();
  const sourceQuote = String(proposal.sourceQuote || '').trim();

  return {
    at,
    proposalId: buildProposalId(proposal),
    kind: 'new_rule',
    rationale: rationale !== '' ? rationale : '返信メールでの指示',
    summary: summary !== '' ? summary : `${proposal.pattern} → ${proposal.label}`,
    matchKind: proposal.matchKind,
    pattern: proposal.pattern,
    label: proposal.label,
    approval: '未確認',
    appliedAt: '',
    comment: sourceQuote !== '' ? `返信メールより: 「${sourceQuote}」` : '返信メールでの指示から起票しました。',
  };
}

/**
 * 中継メールを検索して読み、proposals へ書き込む。
 *
 * 処理済みのスレッドにはラベルを付けて検索から外す。さらに proposalId が
 * 既存の proposals と重なる指示は追加しない (スレッド単位の印だけでは、
 * 同じ内容が違うスレッドで再送された場合を防げないため)。
 */
function proposeFromReplyMail(): number {
  assertGmailQuotaAvailable();
  const threads = GmailApp.search(
    `subject:"${RELAY_SUBJECT}" -label:${RELAY_PROCESSED_LABEL}`,
    0,
    CONFIG.SEARCH_PAGE_SIZE
  );
  if (threads.length === 0) return 0;

  const existingIds = readRows(SHEET_NAMES.PROPOSALS).map((row) => String(row['proposalId'] || ''));
  const processedLabel = getOrCreateLabel(RELAY_PROCESSED_LABEL);
  const at = new Date();
  const rows: Row[] = [];

  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      for (const proposal of parseRelayProposals(message.getPlainBody())) {
        if (isDuplicateProposal(existingIds, proposal)) continue;
        rows.push(buildReplyProposal(proposal, at));
        existingIds.push(buildProposalId(proposal));
      }
    }
    thread.addLabel(processedLabel);
  }

  appendRows(SHEET_NAMES.PROPOSALS, rows);
  console.log(`proposeFromReplyMail: ${rows.length} 件を提案しました`);
  return rows.length;
}
