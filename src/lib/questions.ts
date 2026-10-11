import type { JudgeQuestion } from "./providers/types";
import type { Signal } from "./labels";

/**
 * Jev への型付き質問定義。文面を変えたら config/judging.json の questionSetVersion を上げる。
 * 状態(state)のキーは質問文中でバッククォートで参照する（Jev 推奨の書き方）。
 */

export const SIGNAL_DEFINITIONS: Record<Signal, string> = {
  jobs: "a job posting by `target_company` for a role located in Japan or responsible for the Japanese market",
  japanese_support: "Japanese-language support by `target_company`: a Japanese website, Japanese product UI, Japanese documentation, or a contact point for customers in Japan",
  events: "`target_company` hosting, speaking at, sponsoring, or exhibiting at an event, conference or hackathon held in Japan",
  media_visit: "a direct interview of `target_company` (or its executives) by Japanese media, or its executives visiting Japan / doing activities in Japan",
  ambassador: "a person active in Japan having an official ambassador / community-lead relationship with `target_company`",
  ads: "advertising by `target_company` aimed at Japan (ads in Japanese, ad campaigns delivered in Japan, landing pages for Japan)",
  partners: "a partnership between `target_company` and a company in Japan: reseller/sales partnership, co-development, or implementation support",
  customers: "a company or organization in Japan using `target_company`'s product (trial, PoC or production deployment)",
  local_presence: "`target_company` having an office, legal entity, Japan country manager/staff, or acquiring a company in Japan",
};

export const STATUS_OPTIONS: Record<string, string> = {
  intent_plan: "Only intention, plan, announcement of future activity, or a call for applications; not yet carried out",
  executed: "The activity has actually been carried out or is in effect (e.g. page is live, event happened, deal signed, office opened, job is posted)",
  continued_expanded: "The evidence itself shows the activity being repeated, continued over time, or expanded (e.g. second office, more partners, scaling up)",
};

export function evidenceClassificationQuestions(signals: readonly Signal[]): Record<string, JudgeQuestion> {
  const q: Record<string, JudgeQuestion> = {
    is_target: {
      type: "noul",
      prompt:
        "Is `evidence` about `target_company` itself (the organization described in `target_company.disambiguation`), and not about a different organization that merely has a similar name?",
    },
    japan_scope: {
      type: "choice",
      prompt: "How does `evidence` relate to the Japanese market?",
      options: {
        japan_specific: "Specifically about Japan (Japanese customers, Japanese entity, events in Japan, Japan-specific roles)",
        apac_shared: "About the Asia-Pacific region in general, with Japan as one of several countries",
        global_generic: "Global or generic content that is not specific to Japan (even if written in Japanese)",
        not_related: "Not related to Japan at all",
      },
    },
  };
  for (const s of signals) q[`sig_${s}`] = { type: "noul", prompt: `Does \`evidence\` explicitly describe ${SIGNAL_DEFINITIONS[s]}?` };
  return q;
}

/** シグナルごとの状態と詳細。複数シグナルがあれば項目ごとに聞く */
export function signalDetailQuestions(s: Signal): Record<string, JudgeQuestion> {
  const q: Record<string, JudgeQuestion> = {
    [`st_${s}`]: {
      type: "choice",
      prompt: `Regarding ${SIGNAL_DEFINITIONS[s]}, what does \`evidence\` actually confirm?`,
      options: STATUS_OPTIONS,
    },
  };
  switch (s) {
    case "jobs":
      q.job_japan_role = { type: "noul", prompt: "Is the job in `evidence` responsible for the Japanese market (located in Japan or covering Japanese customers)?" };
      q.job_japanese_required = { type: "noul", prompt: "Does the job in `evidence` require Japanese language ability?" };
      break;
    case "japanese_support":
      q.dedicated_team = {
        type: "noul",
        prompt: "Does `evidence` explicitly state that there are people or a team dedicated to Japan (not just translated pages)?",
      };
      q.jp_contact = { type: "noul", prompt: "Does `evidence` show a contact point (sales/support) specifically for customers in Japan?" };
      break;
    case "ambassador":
      q.amb_actual = {
        type: "noul",
        prompt:
          "Does `evidence` name a specific person who is officially an ambassador of `target_company` and show their actual activity, rather than only recruiting or calling for applicants?",
      };
      break;
    case "partners":
      q.partner_type = {
        type: "choice",
        prompt: "What is the relationship between `target_company` and the Japanese company in `evidence`?",
        options: {
          sales_partnership: "Reseller, distributor or sales/referral partnership",
          co_development: "Joint development of a product or solution",
          implementation_support: "System integration or implementation support for customers",
          investor_only: "The Japanese company only invested in `target_company`",
          customer_only: "The Japanese company is only a customer/user",
        },
      };
      break;
    case "customers":
      q.customer_stage = {
        type: "choice",
        prompt: "What stage of adoption by the Japanese organization does `evidence` confirm?",
        options: {
          plan: "Only a plan, intention, or MOU to consider using it",
          trial: "A trial, pilot or proof-of-concept",
          production: "A production deployment in actual business",
          production_outcome: "A production deployment with reported quantitative outcomes",
          not_customer: "The organization is a partner or investor, not a customer",
        },
      };
      break;
    case "events":
      q.event_role = {
        type: "choice",
        prompt: "What role does `target_company` have in the event in Japan described in `evidence`?",
        options: {
          host: "Hosts or organizes the event",
          speaker: "Speaks or presents at the event",
          sponsor: "Sponsors or exhibits at the event",
          upcoming: "The event is announced but has not happened yet",
          mention_only: "Only mentioned, no confirmed role",
        },
      };
      break;
    case "media_visit":
      q.media_kind = {
        type: "choice",
        prompt: "What kind of media/visit evidence is this?",
        options: {
          direct_interview: "Japanese media directly interviewed `target_company` or its executives",
          executive_visit: "Executives visited Japan or held activities in Japan",
          secondhand: "Second-hand coverage or reprint of a press release without direct interview",
        },
      };
      break;
    case "local_presence":
      q.presence_kind = {
        type: "choice",
        prompt: "What kind of presence in Japan does `evidence` confirm?",
        options: {
          office: "An office in Japan",
          entity: "A Japanese legal entity (KK/GK)",
          japan_lead: "A named person responsible for Japan",
          acquisition: "Acquisition of a Japanese company",
          plan_only: "Only a plan to establish presence",
        },
      };
      break;
    case "ads":
      q.ad_targeted = { type: "noul", prompt: "Does `evidence` show ad copy or an ad campaign that is targeted at people in Japan?" };
      break;
  }
  return q;
}

export const DIFF_QUESTION: Record<string, JudgeQuestion> = {
  diff_meaningful: {
    type: "noul",
    prompt:
      "Comparing `change.before` and `change.after`, is this change meaningful for `target_company`'s go-to-market in Japan (not just wording, design, navigation or date updates)?",
  },
};

export const STAGE_OPTIONS: Record<string, string> = {
  exploration: "Exploration: showing interest in Japan (Japanese pages, media interest, intentions) but no dedicated investment confirmed",
  preparation: "Preparation: concrete investments in progress (Japan hiring, plans for office, first partners) but sales not yet clearly launched",
  launch: "Launch: selling in Japan has started (office or entity, Japan team, partners, first Japanese customers)",
  expansion: "Expansion: established in Japan and growing (multiple customers in production, multiple partners, team growth)",
};

export function companyAssessmentQuestions(): Record<string, JudgeQuestion> {
  return {
    stage: { type: "choice", prompt: "Based only on `confirmed_signals` and `facts`, which go-to-market stage in Japan best describes `target_company`?", options: STAGE_OPTIONS },
    motion_direct: { type: "noul", prompt: "Do `facts` suggest `target_company` sells directly to enterprises in Japan with its own sales team?" },
    motion_partner: { type: "noul", prompt: "Do `facts` suggest `target_company` sells in Japan through resellers or sales partners?" },
    motion_codev: { type: "noul", prompt: "Do `facts` suggest `target_company` co-develops products or solutions with Japanese companies?" },
    motion_dev_community: { type: "noul", prompt: "Do `facts` suggest `target_company` acquires users in Japan through a developer community (meetups, hackathons, ambassadors, docs)?" },
    motion_self_serve: { type: "noul", prompt: "Do `facts` suggest users in Japan can sign up and buy `target_company`'s product by themselves (self-serve)?" },
  };
}
