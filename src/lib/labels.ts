export const SIGNALS = [
  "jobs",
  "japanese_support",
  "events",
  "media_visit",
  "ambassador",
  "ads",
  "partners",
  "customers",
  "local_presence",
] as const;
export type Signal = (typeof SIGNALS)[number];

export const SIGNAL_LABEL: Record<Signal, string> = {
  jobs: "求人",
  japanese_support: "日本語対応",
  events: "イベント",
  media_visit: "取材・来日",
  ambassador: "アンバサダー",
  ads: "広告",
  partners: "パートナー",
  customers: "顧客",
  local_presence: "現地体制",
};

export const STATUSES = ["unconfirmed", "intent_plan", "executed", "continued_expanded"] as const;
export type SignalStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<SignalStatus, string> = {
  unconfirmed: "未確認",
  intent_plan: "意向・計画",
  executed: "実行確認",
  continued_expanded: "継続・拡大確認",
};
export const STATUS_RANK: Record<SignalStatus, number> = {
  unconfirmed: 0,
  intent_plan: 1,
  executed: 2,
  continued_expanded: 3,
};

export const STAGES = ["undetermined", "exploration", "preparation", "launch", "expansion"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  undetermined: "判定保留",
  exploration: "探索",
  preparation: "準備",
  launch: "立ち上げ",
  expansion: "拡大",
};

export const MOTIONS = ["direct", "partner", "codev", "dev_community", "self_serve", "other"] as const;
export type Motion = (typeof MOTIONS)[number];
export const MOTION_LABEL: Record<Motion | "undetermined", string> = {
  direct: "直販",
  partner: "パートナー販売",
  codev: "共同開発",
  dev_community: "開発者コミュニティ",
  self_serve: "セルフサービス",
  other: "その他",
  undetermined: "判定保留",
};

export const SCOPE_LABEL: Record<string, string> = {
  japan_specific: "日本専用",
  apac_shared: "APAC共通",
  global_generic: "世界共通",
  not_related: "日本と無関係",
};

export const RELIABILITY_LABEL: Record<string, string> = {
  official: "企業公式",
  primary_third_party: "一次情報（提携先・顧客・主催者）",
  media: "報道・取材",
  aggregator: "まとめ・転載",
  unknown: "不明",
};

export const ORIGIN_LABEL: Record<string, string> = {
  page: "監視ページ",
  page_diff: "ページ差分",
  job_posting: "求人票",
  job_closed: "求人掲載終了",
  discovery: "検索で発見",
  registry: "法人登記",
};

export const FEED_TYPE_LABEL: Record<string, string> = {
  baseline: "監視開始",
  job_added: "日本関連求人が追加",
  job_changed: "求人内容が変更",
  job_closed: "求人の掲載終了",
  page_changed: "ページ本文が変更",
  jp_page_new: "日本語ページが新設",
  signal_new: "新しいシグナル",
  signal_upgraded: "シグナルの状態が前進",
  discovery: "新しい情報源を発見",
  fetch_error: "取得エラー",
  stage_changed: "推定GTM段階が変化",
  registry_entity_added: "日本法人の登記を検知",
};

export const SIGNAL_EN: Record<Signal, string> = {
  jobs: "Jobs",
  japanese_support: "Japanese support",
  events: "Events",
  media_visit: "Media / visits",
  ambassador: "Ambassadors",
  ads: "Ads",
  partners: "Partners",
  customers: "Customers",
  local_presence: "Local presence",
};
export const STATUS_EN: Record<SignalStatus, string> = {
  unconfirmed: "Unconfirmed",
  intent_plan: "Intent / plan",
  executed: "Executed",
  continued_expanded: "Continued / expanded",
};
export const STAGE_EN: Record<Stage, string> = {
  undetermined: "Undetermined",
  exploration: "Exploration",
  preparation: "Preparation",
  launch: "Launch",
  expansion: "Expansion",
};
export const MOTION_EN: Record<string, string> = {
  direct: "Direct sales",
  partner: "Partner sales",
  codev: "Co-development",
  dev_community: "Developer community",
  self_serve: "Self-serve",
  other: "Other",
  undetermined: "Undetermined",
};
