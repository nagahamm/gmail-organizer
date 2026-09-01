/**
 * 未分類の集計から提案を立てる。
 *
 * 承認ループの入口。当初は週次 AI が担う想定だったが、Google Drive の
 * コネクタはファイルの中身を書けないため、Routine からシートへ追記できない
 * (`docs/design.md`「提案を誰が立てるか」)。
 *
 * そこで**判断が要らない提案だけ**をここで立てる。受信トレイから外すかどうかは、
 * Gmail のカテゴリと未読率がそのまま答えになる。どのラベルへ入れるかは
 * 機械には決められないので決めない。
 */

/** 1 回に立てる提案の上限。承認する側が読み切れる量で止める。 */
const SKIP_PROPOSAL_LIMIT = 20;

/**
 * 提案するラベル。ジャンルは決めず大項目に留める。
 * 承認する前に人がプルダウンで直す前提。
 */
const SKIP_PROPOSAL_LABEL = 'Promotions';

function proposeInboxSkips(): number {
  const unmatched = readRows(SHEET_NAMES.UNMATCHED);
  const at = new Date();

  const rows: Row[] = [];
  const marks: CellUpdate[] = [];

  for (const row of unmatched) {
    if (rows.length >= SKIP_PROPOSAL_LIMIT) break;
    if (!isSkipProposable(row)) continue;

    const from = String(row['from'] || '').trim();
    const domain = senderDomain(from);
    if (domain === '') continue;

    rows.push(buildSkipProposal(row, domain, at));
    // 立てた時点で印を付ける。承認を待たずに次回の提案から外すため。
    marks.push({ rowNumber: Number(row['_rowNumber']), key: 'proposed', value: true });
  }

  appendRows(SHEET_NAMES.PROPOSALS, rows);
  updateCells(SHEET_NAMES.UNMATCHED, marks);
  console.log(`proposeInboxSkips: ${rows.length} 件を提案しました`);
  return rows.length;
}

/** その行を提案してよいか。除外候補で、まだ提案していないもの。 */
function isSkipProposable(row: Row): boolean {
  if (row['skipInboxCandidate'] !== true) return false;
  if (row['proposed'] === true) return false;
  return String(row['from'] || '').trim() !== '';
}

/** unmatched の 1 行から proposals の 1 行を作る。 */
function buildSkipProposal(row: Row, domain: string, at: Date): Row {
  const category = String(row['category'] || '');
  const count = Number(row['count7d']) || 0;
  const unreadRate = String(row['unreadRate'] || '');

  return {
    at,
    proposalId: `skip-${domain}`,
    kind: 'inbox_skip',
    rationale: `Gmail の ${category} に入っており、受信トレイに ${count} 件、未読率 ${unreadRate}`,
    summary: `from:${domain} → 受信トレイから外して既読にする`,
    matchKind: 'from_domain',
    pattern: domain,
    label: SKIP_PROPOSAL_LABEL,
    approval: '未確認',
    appliedAt: '',
    comment: `ラベルは ${SKIP_PROPOSAL_LABEL} のままにしています。ジャンルが分かるなら承認する前にプルダウンで直してください。読みたいメールなら却下してください。`,
  };
}
