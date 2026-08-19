/**
 * シートのスキーマ定義。
 *
 * 列の並びと入力規則はここだけに書く。setup() はこの定義からシートを生成し、
 * 読み書きのユーティリティも同じ定義を参照する (DRY)。
 * 列を足すときはこのファイルだけを直せばよい。
 */

type ColumnType = 'text' | 'number' | 'date' | 'checkbox' | 'formula';
type ValidationKind =
  | 'labelPath'
  | 'matchKind'
  | 'approval'
  | 'labelState'
  | 'migrationOp'
  | 'senderKind'
  | 'senderState';

interface ColumnSpec {
  /** コード側から参照する識別子。 */
  key: string;
  /** シート 1 行目に出るヘッダ文字列。 */
  header: string;
  type?: ColumnType;
  width?: number;
  validation?: ValidationKind;
  /** type が 'formula' のとき、2 行目に入れる ARRAYFORMULA。 */
  formula?: string;
  note?: string;
}

interface SheetSpec {
  name: string;
  columns: ColumnSpec[];
  note: string;
}

/** `labels.full_path` を B/C/D 列から組み立てる。3 階層のうち空の段は詰める。 */
const FULL_PATH_FORMULA =
  '=ARRAYFORMULA(IF($B2:$B="","",$B2:$B&IF($C2:$C="","","/"&$C2:$C)&IF($D2:$D="","","/"&$D2:$D)))';

const SHEET_SPECS: SheetSpec[] = [
  {
    name: SHEET_NAMES.LABELS,
    note: 'ラベルマスタ。大項目 = メールの種別、中項目 = ジャンル、小項目 = ブランド。',
    columns: [
      { key: 'labelKey', header: 'label_key', width: 90 },
      { key: 'major', header: '大項目', width: 100 },
      { key: 'middle', header: '中項目', width: 120 },
      { key: 'minor', header: '小項目', width: 120 },
      {
        key: 'fullPath',
        header: 'full_path',
        type: 'formula',
        width: 220,
        formula: FULL_PATH_FORMULA,
        note: 'Gmail 上のラベル名そのもの。B/C/D から自動生成される。',
      },
      { key: 'gmailLabelId', header: 'gmail_label_id', width: 200 },
      { key: 'defaultSkipInbox', header: '既定_受信トレイ除外', type: 'checkbox', width: 140 },
      { key: 'defaultMarkRead', header: '既定_既読化', type: 'checkbox', width: 110 },
      { key: 'state', header: '状態', validation: 'labelState', width: 90 },
      { key: 'description', header: '説明', width: 260 },
      { key: 'messageCount', header: '件数', type: 'number', width: 80 },
      { key: 'syncedAt', header: '最終同期', type: 'date', width: 120 },
    ],
  },
  {
    name: SHEET_NAMES.RULES,
    note: 'メーリングリスト ↔ ラベル。振り分けの真実の源。',
    columns: [
      { key: 'ruleId', header: 'rule_id', width: 80 },
      { key: 'enabled', header: '有効', type: 'checkbox', width: 60 },
      { key: 'priority', header: '優先度', type: 'number', width: 70, note: '小さいほど先に評価する。' },
      {
        key: 'kind',
        header: '種別',
        validation: 'matchKind',
        width: 110,
        note: 'list_id を第一級に扱う。from のワイルドカードは Gmail が解釈しないため使わない。',
      },
      { key: 'pattern', header: 'パターン', width: 260 },
      { key: 'label', header: 'ラベル', validation: 'labelPath', width: 200 },
      { key: 'location', header: '拠点', width: 70, note: '@AU またはブランク。@JP は作らない。' },
      { key: 'skipInbox', header: '受信トレイ除外', type: 'checkbox', width: 120 },
      { key: 'markRead', header: '既読化', type: 'checkbox', width: 80 },
      { key: 'star', header: 'スター', type: 'checkbox', width: 70 },
      { key: 'neverSpam', header: '迷惑メールにしない', type: 'checkbox', width: 140 },
      {
        key: 'frozenAt',
        header: '凍結日',
        type: 'date',
        width: 110,
        note: 'この日以降は新規メールに適用しない。@AU の段階的な終了に使う。',
      },
      { key: 'memo', header: 'メモ', width: 240 },
      { key: 'createdAt', header: '登録日', type: 'date', width: 110 },
      { key: 'lastMatchedAt', header: '最終マッチ日', type: 'date', width: 120 },
      { key: 'matchCount', header: '累計マッチ数', type: 'number', width: 110 },
    ],
  },
  {
    name: SHEET_NAMES.SENDERS,
    note: '送信元マスタ。1 行 1 送信元。運営元とサービスを分けて持つことで、同じ会社の複数サービスをまとめて見られるようにする。',
    columns: [
      { key: 'address', header: '送信元', width: 260 },
      {
        key: 'operator',
        header: '運営元',
        width: 140,
        note: '会社名。Amazon / リクルート / DMM / 楽天 など。1 社が複数サービスを持つ。',
      },
      {
        key: 'service',
        header: 'サービス',
        width: 180,
        note: 'ブランド名。じゃらん / ホットペッパービューティー / リクルートエージェントなど、同じ運営元でも行き先が変わる。',
      },
      { key: 'kind', header: '系統', validation: 'senderKind', width: 120 },
      { key: 'label', header: 'ラベル', validation: 'labelPath', width: 200 },
      { key: 'listId', header: 'list_id', width: 200 },
      { key: 'location', header: '拠点', width: 70 },
      { key: 'cadence', header: '配信頻度', width: 160, note: '観測した配信間隔や時刻。メルマガは時刻がほぼ固定される。' },
      { key: 'recentCount', header: '直近90日', type: 'number', width: 90 },
      { key: 'firstSeen', header: '初回受信', type: 'date', width: 120 },
      { key: 'lastSeen', header: '最終受信', type: 'date', width: 120 },
      { key: 'state', header: '状態', validation: 'senderState', width: 110 },
      { key: 'unsubscribe', header: '購読解除', type: 'checkbox', width: 90, note: '解約候補の印。週次 AI が提案し、人が判断する。' },
      { key: 'memo', header: '備考', width: 260 },
    ],
  },
  {
    name: SHEET_NAMES.LOG,
    note: '実行ログ。件名は先頭 60 文字まで。本文は記録しない。',
    columns: [
      { key: 'at', header: '実行時刻', type: 'date', width: 150 },
      { key: 'runId', header: 'run_id', width: 130 },
      { key: 'messageId', header: 'message_id', width: 180 },
      { key: 'from', header: 'from', width: 220 },
      { key: 'listId', header: 'list_id', width: 200 },
      { key: 'subject', header: '件名', width: 320 },
      { key: 'ruleId', header: 'rule_id', width: 80 },
      { key: 'appliedLabel', header: '付与ラベル', width: 180 },
      { key: 'action', header: 'アクション', width: 160 },
      { key: 'result', header: '結果', width: 140 },
    ],
  },
  {
    name: SHEET_NAMES.UNMATCHED,
    note: '未分類の送信元。週次 AI の入力になる。',
    columns: [
      { key: 'at', header: '集計日', type: 'date', width: 110 },
      { key: 'from', header: '送信元', width: 240 },
      { key: 'listId', header: 'list_id', width: 200 },
      { key: 'count7d', header: '直近7日件数', type: 'number', width: 110 },
      { key: 'countTotal', header: '累計件数', type: 'number', width: 90, note: '1 回の検索で取れる上限までしか数えないため、上限に達した場合は下限値。' },
      { key: 'unreadRate', header: '未読率', width: 80, note: '高いほど読む気がない = 受信トレイ除外の候補。' },
      { key: 'firstSeen', header: '初回受信日', type: 'date', width: 110 },
      { key: 'sampleSubject', header: '代表件名', width: 320 },
      { key: 'proposed', header: '提案済み', type: 'checkbox', width: 90 },
    ],
  },
  {
    name: SHEET_NAMES.PROPOSALS,
    note: 'AI の提案と承認。承認列を「承認」に変えるだけで次回実行が rules へ反映する。',
    columns: [
      { key: 'at', header: '提案日', type: 'date', width: 110 },
      { key: 'proposalId', header: '提案ID', width: 110 },
      { key: 'kind', header: '種別', width: 130, note: 'new_rule / new_label / inbox_skip / rename_label / archive_label / unsubscribe' },
      { key: 'rationale', header: '根拠', width: 300 },
      { key: 'summary', header: '提案内容', width: 320 },
      { key: 'matchKind', header: '提案パターン種別', validation: 'matchKind', width: 130 },
      { key: 'pattern', header: '提案パターン', width: 240 },
      { key: 'label', header: '提案ラベル', validation: 'labelPath', width: 200 },
      { key: 'approval', header: '承認', validation: 'approval', width: 90 },
      { key: 'appliedAt', header: '反映日', type: 'date', width: 110 },
      { key: 'comment', header: 'AIコメント', width: 320 },
    ],
  },
  {
    name: SHEET_NAMES.SAMPLING,
    note: '移行前の実態調査。読み取り専用の結果置き場。',
    columns: [
      { key: 'at', header: '集計日', type: 'date', width: 110 },
      { key: 'survey', header: '調査対象', width: 200 },
      { key: 'bucket', header: '分類', width: 140 },
      { key: 'key', header: 'キー', width: 260 },
      { key: 'count', header: '件数', type: 'number', width: 80 },
      { key: 'share', header: '割合', width: 80 },
      { key: 'sampleSubject', header: '代表件名', width: 360 },
      { key: 'note', header: '備考', width: 240 },
    ],
  },
  {
    name: SHEET_NAMES.MIGRATION,
    note: '現行ラベル → 新体系の移行計画。docs/label-migration.md を見ながら新ラベル列を埋める。',
    columns: [
      { key: 'enabled', header: '有効', type: 'checkbox', width: 60 },
      { key: 'current', header: '現行ラベル', width: 220 },
      { key: 'messageCount', header: '件数', type: 'number', width: 80 },
      { key: 'target', header: '新ラベル', validation: 'labelPath', width: 220 },
      { key: 'location', header: '拠点', width: 70, note: '@AU を遡及付与する場合に入れる。' },
      {
        key: 'operation',
        header: '操作',
        validation: 'migrationOp',
        width: 100,
        note: 'rename は改名 (割り当てを保持)。merge は付与のみで旧ラベルは消さない。tag は拠点だけ付ける。',
      },
      { key: 'state', header: '状態', width: 90 },
      { key: 'ranAt', header: '実行日', type: 'date', width: 120 },
      { key: 'memo', header: '備考', width: 300 },
    ],
  },
  {
    name: SHEET_NAMES.CONFIG,
    note: '実行時の設定。コード側の CONFIG より優先される。',
    columns: [
      { key: 'key', header: 'キー', width: 200 },
      { key: 'value', header: '値', width: 160 },
      { key: 'description', header: '説明', width: 460 },
    ],
  },
];

/** `config` シートの初期値。setup() が空のときだけ投入する。 */
const CONFIG_DEFAULTS: string[][] = [
  ['DRY_RUN', 'TRUE', 'TRUE の間はラベルを変更せず log に dry_run として記録するだけ'],
  ['RETRO_QUERY_WINDOW', CONFIG.RETRO_QUERY_WINDOW, '遡及適用の対象期間'],
  ['SAMPLE_LIMIT', String(CONFIG.SAMPLE_LIMIT), 'サンプリングで 1 ラベルあたり読むスレッド数の上限'],
  ['NOTIFY_TO', '', '週次ダイジェストの送信先。空なら実行アカウント宛'],
];

/**
 * 退避先は log と同じ列にする。列定義を二度書かないよう複製して名前だけ変える。
 */
(function appendLogArchiveSpec(): void {
  for (const spec of SHEET_SPECS) {
    if (spec.name !== SHEET_NAMES.LOG) continue;
    SHEET_SPECS.push({
      name: SHEET_NAMES.LOG_ARCHIVE,
      note: '6 か月より古い log 行の退避先。log シートが際限なく伸びるのを防ぐ。',
      columns: spec.columns,
    });
    return;
  }
})();

function findSheetSpec(name: string): SheetSpec {
  for (const spec of SHEET_SPECS) {
    if (spec.name === name) return spec;
  }
  throw new Error(`未定義のシートです: ${name}`);
}
