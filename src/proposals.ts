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

function applyApprovedProposals(): void {
  const rows = readRows(SHEET_NAMES.PROPOSALS);
  const now = new Date();

  const added: { pattern: string; label: string }[] = [];
  let approved = 0;
  let rejected = 0;

  for (const row of rows) {
    if (String(row['appliedAt'] || '') !== '') continue;
    const approval = String(row['approval'] || '').trim();

    if (approval === '却下') {
      markProposed(String(row['pattern'] || ''));
      updateCell(SHEET_NAMES.PROPOSALS, Number(row['_rowNumber']), 'appliedAt', now);
      rejected += 1;
      continue;
    }
    if (approval !== '承認') continue;

    const label = String(row['label'] || '').trim();
    const pattern = String(row['pattern'] || '').trim();
    const kind = String(row['kind'] || '').trim();

    if (label) ensureLabelRow(label);

    if (LABEL_ONLY_KINDS.indexOf(kind) < 0 && pattern !== '' && label !== '') {
      appendRuleFromProposal(row, now);
      added.push({ pattern, label });
    }

    markProposed(pattern);
    updateCell(SHEET_NAMES.PROPOSALS, Number(row['_rowNumber']), 'appliedAt', now);
    approved += 1;
  }

  if (added.length > 0) applyNewRulesRetroactively(added);
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
function applyNewRulesRetroactively(added: { pattern: string; label: string }[]): void {
  const wanted: Record<string, boolean> = {};
  for (const item of added) wanted[`${item.pattern} ${item.label}`] = true;

  const now = new Date();
  const rules = loadRules().filter(
    (rule) => wanted[`${rule.pattern} ${rule.label}`] && isRuleApplicable(rule, now, true)
  );
  if (rules.length === 0) return;

  const windowQuery = readConfig('RETRO_QUERY_WINDOW', CONFIG.RETRO_QUERY_WINDOW);
  const processed = runRules(rules, windowQuery);
  console.log(`applyNewRulesRetroactively: ${rules.length} ルールで ${processed} スレッドを処理`);
}

/** labels シートに無いラベルなら 3 階層へ分解して追加する。 */
function ensureLabelRow(fullPath: string): void {
  for (const row of readRows(SHEET_NAMES.LABELS)) {
    if (String(row['fullPath'] || '').trim() === fullPath) return;
  }

  const parts = splitLabelPath(fullPath);
  appendRows(SHEET_NAMES.LABELS, [
    {
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
    },
  ]);
}

/** 同じ送信元について同じ提案を繰り返さないよう印を付ける。 */
function markProposed(pattern: string): void {
  if (pattern === '') return;

  for (const row of readRows(SHEET_NAMES.UNMATCHED)) {
    const from = String(row['from'] || '');
    const listId = String(row['listId'] || '');
    if (from !== pattern && listId !== pattern && from.indexOf(pattern) < 0) continue;
    updateCell(SHEET_NAMES.UNMATCHED, Number(row['_rowNumber']), 'proposed', true);
  }
}
