/**
 * 全体設定。
 *
 * ここにドメインやメールアドレスを書かないこと。振り分けルールは
 * スプレッドシートの `rules` シートが正 (CLAUDE.md の約束)。
 */
const CONFIG = {
  /**
   * true の間はラベルを一切変更せず、`log` シートに `dry_run` として記録するだけ。
   * 本適用の前に必ずこの状態で 1 度通し、ログを目視してから false にする。
   */
  DRY_RUN: true,

  /** ログに残す件名の最大長。本文は決して記録しない。 */
  SUBJECT_MAX: 60,

  /** GmailApp.search() 1 回あたりの取得件数。500 が実用上の上限。 */
  SEARCH_PAGE_SIZE: 500,

  /**
   * 1 回の実行で使ってよい時間。GAS の上限は 6 分なので、
   * 余裕を持って打ち切りカーソルを保存する。
   */
  MAX_RUNTIME_MS: 4.5 * 60 * 1000,

  /** 遡及適用の対象期間。直近 1 年。 */
  RETRO_QUERY_WINDOW: 'newer_than:1y',

  /** サンプリング時に 1 ラベルあたり読むスレッド数の上限。 */
  SAMPLE_LIMIT: 300,

  /** 拠点タグ。@JP は作らない (@AU でないものは全部 JP のため)。 */
  LOCATION_AU: '@AU',

  /** スターを入力装置として監視する対象のラベル接頭辞。 */
  WATCH_SOURCE_PREFIX: 'Promo/Jobs/',

  /** スターが付いた求人の昇格先。 */
  WATCH_TARGET_LABEL: 'Job/Watching',

  /** 応募済みと判断したスレッドの行き先。 */
  APPLIED_LABEL: 'Job/Applied',
} as const;

/** シート名。真実の源となるスプレッドシートの構成。 */
const SHEET_NAMES = {
  LABELS: 'labels',
  RULES: 'rules',
  LOG: 'log',
  LOG_ARCHIVE: 'log_archive',
  UNMATCHED: 'unmatched',
  PROPOSALS: 'proposals',
  SAMPLING: 'sampling',
  MIGRATION: 'migration',
  CONFIG: 'config',
} as const;

/** `rules.種別` が取りうる値。 */
const MATCH_KINDS = ['list_id', 'from', 'from_domain', 'subject', 'query'] as const;
type MatchKind = (typeof MATCH_KINDS)[number];

/** `proposals.承認` が取りうる値。 */
const APPROVAL_STATES = ['未確認', '承認', '却下', '保留'] as const;

/** `migration.操作` が取りうる値。 */
const MIGRATION_OPS = ['rename', 'merge', 'tag', 'skip'] as const;
type MigrationOp = (typeof MIGRATION_OPS)[number];
