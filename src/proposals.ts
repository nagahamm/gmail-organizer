/**
 * 承認された提案を rules へ反映する。
 *
 * この設計の要にあたる部分。当初の課題「登録が面倒」に対して、
 * ユーザーの操作を承認列のプルダウンを 1 つ変えるだけに圧縮する。
 *
 * 反映したルールはその場で遡及適用する。Gmail フィルタでは絶対にできなかった
 * 「後から効く」がここで実現する。
 */

/** ラベルだけを作る提案。ルール行は作らない。 */
const LABEL_ONLY_KINDS = ['new_label', 'rename_label', 'archive_label'];

function applyApprovedProposals(startedAt?: number): void {
  const since = budgetStart(startedAt);
  const rows = readRows(SHEET_NAMES.PROPOSALS);
  const now = new Date();

  // 提案 1 件ごとに labels / unmatched を読み直すと提案数 × 行数になる。先に 1 回だけ読む。
  const labelPaths = knownLabelPaths();
  const unmatched = readRows(SHEET_NAMES.UNMATCHED);

  const added: { pattern: string; label: string }[] = [];
  const newLabels: Row[] = [];
  const proposalUpdates: CellUpdate[] = [];
  const unmatchedUpdates: CellUpdate[] = [];
  let approved = 0;
  let rejected = 0;

  for (const row of rows) {
    if (String(row['appliedAt'] || '') !== '') continue;
    const approval = String(row['approval'] || '').trim();

    if (approval === '却下') {
      collectProposed(unmatched, String(row['pattern'] || ''), unmatchedUpdates);
      proposalUpdates.push({ rowNumber: Number(row['_rowNumber']), key: 'appliedAt', value: now });
      rejected += 1;
      continue;
    }
    if (approval !== '承認') continue;

    const label = String(row['label'] || '').trim();
    const pattern = String(row['pattern'] || '').trim();
    const kind = String(row['kind'] || '').trim();

    if (label !== '' && !labelPaths[label]) {
      labelPaths[label] = true;
      newLabels.push(buildLabelRow(label));
    }

    if (LABEL_ONLY_KINDS.indexOf(kind) < 0 && pattern !== '' && label !== '') {
      appendRuleFromProposal(row, now);
      added.push({ pattern, label });
    }

    collectProposed(unmatched, pattern, unmatchedUpdates);
    proposalUpdates.push({ rowNumber: Number(row['_rowNumber']), key: 'appliedAt', value: now });
    approved += 1;
  }

  appendRows(SHEET_NAMES.LABELS, newLabels);
  updateCells(SHEET_NAMES.UNMATCHED, unmatchedUpdates);
  updateCells(SHEET_NAMES.PROPOSALS, proposalUpdates);

  if (added.length > 0) applyNewRulesRetroactively(added, since);
  console.log(`applyApprovedProposals: 承認 ${approved} 件 / 却下 ${rejected} 件 / ルール追加 ${added.length} 件`);
}

/** 提案 1 行から rules の行を作る。受信トレイ除外の提案は既読化もセットで入れる。 */
function appendRuleFromProposal(row: Row, now: Date): void {
  const kind = String(row['kind'] || '').trim();
  const skipInbox = kind === 'inbox_skip';

  appendRows(SHEET_NAMES.RULES, [
    {
      ruleId: String(row['proposalId'] || ''),
      enabled: true,
      priority: 500,
      kind: String(row['matchKind'] || 'list_id'),
      pattern: String(row['pattern'] || ''),
      label: String(row['label'] || ''),
      location: '',
      skipInbox,
      markRead: skipInbox,
      star: false,
      neverSpam: false,
      frozenAt: '',
      memo: `提案 ${row['proposalId']} から承認: ${row['rationale']}`,
      createdAt: now,
      lastMatchedAt: '',
      matchCount: 0,
    },
  ]);
}

/**
 * 追加したばかりのルールだけを遡及適用する。
 * 行番号を推測せず、シートを読み直して該当行を引き当てる。
 */
function applyNewRulesRetroactively(
  added: { pattern: string; label: string }[],
  startedAt?: number
): void {
  const wanted: Record<string, boolean> = {};
  for (const item of added) wanted[`${item.pattern} ${item.label}`] = true;

  const now = new Date();
  const rules = loadRules().filter(
    (rule) => wanted[`${rule.pattern} ${rule.label}`] && isRuleApplicable(rule, now, true)
  );
  if (rules.length === 0) return;

  const windowQuery = readConfig('RETRO_QUERY_WINDOW', CONFIG.RETRO_QUERY_WINDOW);
  const processed = runRules(rules, windowQuery, budgetStart(startedAt));
  console.log(`applyNewRulesRetroactively: ${rules.length} ルールで ${processed} スレッドを処理`);
}

/** labels シートに既にあるラベルの索引。 */
function knownLabelPaths(): Record<string, boolean> {
  const paths: Record<string, boolean> = {};
  for (const row of readRows(SHEET_NAMES.LABELS)) {
    const path = String(row['fullPath'] || '').trim();
    if (path !== '') paths[path] = true;
  }
  return paths;
}

/** ラベルのフルパスを 3 階層へ分解して labels の 1 行にする。 */
function buildLabelRow(fullPath: string): Row {
  const parts = splitLabelPath(fullPath);
  return {
    labelKey: '',
    major: parts.major,
    middle: parts.middle,
    minor: parts.minor,
    gmailLabelId: '',
    defaultSkipInbox: false,
    defaultMarkRead: false,
    state: 'active',
    description: '提案から追加',
    messageCount: 0,
    syncedAt: new Date(),
  };
}

/** 同じ送信元について同じ提案を繰り返さないよう、印を付ける行を集める。 */
function collectProposed(unmatched: Row[], pattern: string, into: CellUpdate[]): void {
  if (pattern === '') return;

  for (const row of unmatched) {
    const from = String(row['from'] || '');
    const listId = String(row['listId'] || '');
    if (from !== pattern && listId !== pattern && from.indexOf(pattern) < 0) continue;
    into.push({ rowNumber: Number(row['_rowNumber']), key: 'proposed', value: true });
  }
}
