/**
 * Unified Subsidy Schema for Multi-Source Aggregator
 * 
 * Normalizes data from 8 government sources into a common structure:
 * 1. ISED / Innovation Canada (Federal)
 * 2. Quebec.ca (Provincial)
 * 3. Investissement Québec (Provincial)
 * 4. SHQ - Société d'habitation du Québec (Provincial)
 * 5. SCHL / CMHC (Federal)
 * 6. Hydro-Québec (Provincial utility)
 * 7. RECYC-Québec (Provincial)
 * 8. TEQ / MELCCFP (Provincial)
 */

import { z } from "zod";

/**
 * Source type enum
 */
export enum SubsidySource {
  ISED = "ised",                    // Innovation Canada (Salesforce)
  QUEBEC_CA = "quebec_ca",          // Quebec.ca portal (HTML)
  INVEST_QUEBEC = "invest_quebec",  // Investissement Québec (HTML+JS)
  SHQ = "shq",                      // Société d'habitation (TYPO3)
  CMHC = "cmhc",                    // SCHL/CMHC (HTML)
  HYDRO_QUEBEC = "hydro_quebec",    // Hydro-Québec (HTML/React)
  RECYC_QUEBEC = "recyc_quebec",    // RECYC-Québec (Drupal)
  TEQ = "teq",                      // Transition énergétique (HTML)
}

/**
 * Government level
 */
export enum GovernmentLevel {
  FEDERAL = "federal",
  PROVINCIAL = "provincial",
  MUNICIPAL = "municipal",
  UTILITY = "utility", // Crown corporations like Hydro-Québec
}

/**
 * Funding types
 */
export enum FundingType {
  GRANT = "subvention",              // Non-repayable
  LOAN = "prêt",                     // Repayable
  TAX_CREDIT = "crédit_impôt",      // Tax-based
  CONTRIBUTION = "contribution",     // Partial funding
  REBATE = "remboursement",         // Cashback
  GUARANTEE = "garantie",            // Loan guarantee
  EQUITY = "capital",                // Equity investment
  MIXED = "mixte",                   // Combination
}

/**
 * Program status
 */
export enum ProgramStatus {
  ACTIVE = "actif",
  COMING_SOON = "à_venir",
  CLOSED = "fermé",
  SUSPENDED = "suspendu",
  UNKNOWN = "inconnu",
}

/**
 * Target audience categories
 */
export enum TargetAudience {
  SME = "pme",                       // Small/medium enterprises
  LARGE_ENTERPRISE = "grande_entreprise",
  STARTUP = "startup",
  NONPROFIT = "obnl",
  COOPERATIVE = "coopérative",
  MUNICIPALITY = "municipalité",
  CITIZEN = "citoyen",
  RESEARCHER = "chercheur",
  INDIGENOUS = "autochtone",
  SOCIAL_ECONOMY = "économie_sociale",
}

/**
 * Unified subsidy schema
 */
export const UnifiedSubsidySchema = z.object({
  // Identifiers
  externalId: z.string().describe("ID from source system"),
  source: z.nativeEnum(SubsidySource).describe("Which government source"),
  sourceUrl: z.string().url().describe("Direct link to program page"),
  
  // Basic info
  programName: z.string().describe("Official program name"),
  programNameEn: z.string().optional().describe("English name if available"),
  programNameFr: z.string().optional().describe("French name if available"),
  description: z.string().optional().describe("Program description"),
  
  // Classification
  governmentLevel: z.nativeEnum(GovernmentLevel).describe("Federal/Provincial/etc"),
  fundingType: z.array(z.nativeEnum(FundingType)).describe("Type(s) of financial aid"),
  status: z.nativeEnum(ProgramStatus).default(ProgramStatus.UNKNOWN),
  
  // Organization
  organization: z.string().optional().describe("Administering organization"),
  department: z.string().optional().describe("Government department/ministry"),
  
  // Financial details
  minAmount: z.number().optional().describe("Minimum funding in CAD"),
  maxAmount: z.number().optional().describe("Maximum funding in CAD"),
  fundingDetails: z.string().optional().describe("Detailed funding info"),
  
  // Eligibility
  eligibilityCriteria: z.array(z.string()).default([]).describe("Who can apply"),
  targetAudience: z.array(z.nativeEnum(TargetAudience)).default([]),
  
  // Geographic scope
  provinces: z.array(z.string()).default([]).describe("Applicable provinces/territories"),
  regions: z.array(z.string()).default([]).describe("Specific regions if any"),
  isQuebecOnly: z.boolean().default(false),
  
  // Sectors
  sectors: z.array(z.string()).default([]).describe("Industry sectors"),
  isConstructionRelevant: z.boolean().default(false).describe("Relevant to construction"),
  
  // Application process
  applicationSteps: z.array(z.string()).default([]).describe("How to apply"),
  requiredDocuments: z.array(z.string()).default([]).describe("Required documents"),
  applicationUrl: z.string().optional().describe("Online application link"),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  
  // Deadlines
  deadlineDate: z.string().optional().describe("ISO date string"),
  deadlineText: z.string().optional().describe("Human-readable deadline"),
  isContinuous: z.boolean().default(false).describe("Rolling admissions"),
  
  // Metadata
  scrapedAt: z.date().default(() => new Date()),
  lastVerified: z.date().optional(),
  
  // Raw data for debugging
  rawData: z.record(z.any()).optional().describe("Original source data"),
});

export type UnifiedSubsidy = z.infer<typeof UnifiedSubsidySchema>;

/**
 * Source-specific configuration
 */
export interface SourceConfig {
  source: SubsidySource;
  name: string;
  baseUrl: string;
  governmentLevel: GovernmentLevel;
  scrapeMethod: "aura-api" | "cheerio" | "playwright-basic" | "stagehand";
  estimatedCount: number;
  estimatedDuration: string;
  priority: number; // 1 = highest
}

/**
 * Configuration for all 8 sources
 */
export const SOURCE_CONFIGS: Record<SubsidySource, SourceConfig> = {
  [SubsidySource.ISED]: {
    source: SubsidySource.ISED,
    name: "ISED / Innovation Canada",
    baseUrl: "https://innovation.ised-isde.canada.ca",
    governmentLevel: GovernmentLevel.FEDERAL,
    scrapeMethod: "aura-api",
    estimatedCount: 1500,
    estimatedDuration: "5 minutes", // With Aura API
    priority: 1,
  },
  [SubsidySource.QUEBEC_CA]: {
    source: SubsidySource.QUEBEC_CA,
    name: "Quebec.ca - Liste partielle",
    baseUrl: "https://www.quebec.ca",
    governmentLevel: GovernmentLevel.PROVINCIAL,
    scrapeMethod: "cheerio",
    estimatedCount: 50,
    estimatedDuration: "2 minutes",
    priority: 2,
  },
  [SubsidySource.INVEST_QUEBEC]: {
    source: SubsidySource.INVEST_QUEBEC,
    name: "Investissement Québec",
    baseUrl: "https://www.investquebec.com",
    governmentLevel: GovernmentLevel.PROVINCIAL,
    scrapeMethod: "playwright-basic",
    estimatedCount: 20,
    estimatedDuration: "3 minutes",
    priority: 3,
  },
  [SubsidySource.SHQ]: {
    source: SubsidySource.SHQ,
    name: "Société d'habitation du Québec",
    baseUrl: "https://www.habitation.gouv.qc.ca",
    governmentLevel: GovernmentLevel.PROVINCIAL,
    scrapeMethod: "playwright-basic",
    estimatedCount: 20,
    estimatedDuration: "3 minutes",
    priority: 4,
  },
  [SubsidySource.CMHC]: {
    source: SubsidySource.CMHC,
    name: "SCHL / CMHC",
    baseUrl: "https://www.cmhc-schl.gc.ca",
    governmentLevel: GovernmentLevel.FEDERAL,
    scrapeMethod: "cheerio",
    estimatedCount: 15,
    estimatedDuration: "2 minutes",
    priority: 5,
  },
  [SubsidySource.HYDRO_QUEBEC]: {
    source: SubsidySource.HYDRO_QUEBEC,
    name: "Hydro-Québec",
    baseUrl: "https://www.hydroquebec.com",
    governmentLevel: GovernmentLevel.UTILITY,
    scrapeMethod: "cheerio",
    estimatedCount: 200,
    estimatedDuration: "5 minutes",
    priority: 6,
  },
  [SubsidySource.RECYC_QUEBEC]: {
    source: SubsidySource.RECYC_QUEBEC,
    name: "RECYC-Québec",
    baseUrl: "https://www.recyc-quebec.gouv.qc.ca",
    governmentLevel: GovernmentLevel.PROVINCIAL,
    scrapeMethod: "cheerio",
    estimatedCount: 10,
    estimatedDuration: "2 minutes",
    priority: 7,
  },
  [SubsidySource.TEQ]: {
    source: SubsidySource.TEQ,
    name: "Transition énergétique Québec",
    baseUrl: "https://www.transitionenergetique.gouv.qc.ca",
    governmentLevel: GovernmentLevel.PROVINCIAL,
    scrapeMethod: "cheerio",
    estimatedCount: 8,
    estimatedDuration: "2 minutes",
    priority: 8,
  },
};

/**
 * Multi-source scraping job status
 */
export const MultiSourceJobSchema = z.object({
  jobId: z.string(),
  status: z.enum(["queued", "running", "completed", "failed", "partial"]),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  
  // Per-source progress
  sources: z.record(z.object({
    source: z.nativeEnum(SubsidySource),
    status: z.enum(["pending", "running", "completed", "failed"]),
    scraped: z.number().default(0),
    errors: z.number().default(0),
    duration: z.number().optional().describe("Seconds"),
  })),
  
  // Overall stats
  totalScraped: z.number().default(0),
  totalErrors: z.number().default(0),
  estimatedTotal: z.number(),
});

export type MultiSourceJob = z.infer<typeof MultiSourceJobSchema>;

/**
 * Helper to determine if a program is construction-relevant
 */
export function isConstructionRelevant(program: Partial<UnifiedSubsidy>): boolean {
  const constructionKeywords = [
    "construction",
    "habitation",
    "logement",
    "rénovation",
    "bâtiment",
    "infrastructure",
    "éco",
    "énergie",
    "efficacité",
    "isolation",
    "pyrrhotite",
    "mérule",
  ];
  
  const text = [
    program.programName,
    program.description,
    ...(program.sectors || []),
  ].join(" ").toLowerCase();
  
  return constructionKeywords.some(keyword => text.includes(keyword));
}

/**
 * Helper to normalize province codes
 */
export function normalizeProvinceCode(province: string): string {
  const mapping: Record<string, string> = {
    "québec": "QC",
    "quebec": "QC",
    "qc": "QC",
    "ontario": "ON",
    "on": "ON",
    "canada": "CA",
    // Add more as needed
  };
  
  return mapping[province.toLowerCase()] || province.toUpperCase();
}
