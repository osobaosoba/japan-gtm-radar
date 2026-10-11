import judging from "../../config/judging.json";
import companies from "../../config/companies.json";

export type JudgingConfig = typeof judging;
export type SeedCompany = (typeof companies)["companies"][number];

export const judgingConfig: JudgingConfig = judging;
export const seedCompanies: SeedCompany[] = companies.companies;
