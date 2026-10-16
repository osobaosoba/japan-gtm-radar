import type { ClayPerson } from "./types";

/** 日本に来たいスタートアップ（Radarを使う側）のプロフィール */
export interface StartupProfile {
  id: string;
  name: string;
  oneLiner: string;
  /** Japanese one-liner used in the Japanese draft */
  oneLinerJa?: string;
  category: string;
  /** Clayの業種名（英語の正式名） */
  targetIndustries: string[];
  /** 自分で選んだ「近い会社」（Radarで監視している会社のslug）。自動では推定しない */
  peers: string[];
  senderName: string;
  senderTitle: string;
  /** 文案に入れてよい事実（顧客数・実績など）。空ならプレースホルダー */
  proofPoints: string[];
  fictional: boolean;
}

/** demoモード用。会社も人物も架空。peersだけは実際にRadarで監視している会社 */
export const DEMO_PROFILES: StartupProfile[] = [
  {
    id: "demo-cx",
    name: "Lumenstack AI (fictional)",
    oneLiner: "AI customer-support agents for contact centers",
    oneLinerJa: "コールセンター向けのAIカスタマーサポートエージェント",
    category: "Customer-service AI",
    targetIndustries: ["Telecommunications", "Insurance"],
    peers: ["sierra", "elevenlabs"],
    senderName: "",
    senderTitle: "",
    proofPoints: [],
    fictional: true,
  },
  {
    id: "demo-llm",
    name: "Vectorline (fictional)",
    oneLiner: "internal document search and summarization AI for financial institutions",
    oneLinerJa: "金融機関向けの社内文書検索・要約AI",
    category: "Enterprise LLM",
    targetIndustries: ["Banking", "Financial Services"],
    peers: ["cohere"],
    senderName: "",
    senderTitle: "",
    proofPoints: [],
    fictional: true,
  },
  {
    id: "demo-insure",
    name: "Kitsune Underwriting (fictional)",
    oneLiner: "AI underwriting for insurers",
    oneLinerJa: "保険会社向けのAI引受審査",
    category: "AI insurance",
    targetIndustries: ["Insurance"],
    peers: ["corgi", "braintrust"],
    senderName: "",
    senderTitle: "",
    proofPoints: [],
    fictional: true,
  },
];

const AT = "2026-10-12T00:00:00.000Z";
const p = (name: string, title: string, company: string, extra: Partial<ClayPerson> = {}): ClayPerson => ({
  name,
  title,
  company,
  location: "Tokyo, Japan (sample)",
  locationBasis: "clay_location",
  emailStatus: "not_requested",
  provider: "Clay demo sample (fictional)",
  retrievedAt: AT,
  unknowns: ["Work email (not fetched)", "Whether they influence the decision"],
  ...extra,
});

/** `${profileId}:${pathId}` ごとのClayのサンプル結果。すべて架空の人物・架空の会社 */
export const DEMO_CLAY_SAMPLES: Record<string, ClayPerson[]> = {
  "demo-cx:partner_resale": [
    p("Sample Aoki (fictional)", "Head of Alliances", "Sample Telecom (fictional)", { profileUrl: "https://example.com/in/sample-aoki" }),
    p("Example Mori (fictional)", "Partner Sales Manager", "Sample Systems (fictional)", { unknowns: ["Work email (not fetched)", "Whether they cover generative-AI products"] }),
  ],
  "demo-cx:local_direct": [p("Sample Ito (fictional)", "Head of Customer Experience", "Sample Insurance (fictional)")],
  "demo-llm:codev": [
    p("Example Kato (fictional)", "Director, Generative AI", "Sample SI (fictional)", { profileUrl: "https://example.com/in/example-kato" }),
  ],
  "demo-llm:local_direct": [p("Sample Saito (fictional)", "General Manager, Digital Transformation", "Sample Bank (fictional)")],
};
