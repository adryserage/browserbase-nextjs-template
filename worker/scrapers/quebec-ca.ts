/**
 * Quebec.ca Scraper (Static HTML)
 * 
 * Source: https://www.quebec.ca/.../liste-partielle-aide-financiere
 * Technology: Server-side rendered HTML (no JavaScript required)
 * Method: Cheerio + node-fetch (fast, no browser needed)
 * Estimated: ~50 programs across 13 categories
 * Duration: ~2 minutes
 * 
 * Categories covered:
 * - Action communautaire
 * - Agriculture/environnement/ressources naturelles
 * - Autochtones
 * - Culture et francophonie
 * - Entrepreneuriat et développement économique
 * - Famille et soutien aux personnes
 * - Habitation
 * - Organismes communautaires
 * - Production/commercialisation/distribution
 * - Recherche et innovation
 * - Sécurité/prévention
 * - Transport
 * - Crédits d'impôt
 */

import * as cheerio from "cheerio";
import {
  UnifiedSubsidy,
  SubsidySource,
  GovernmentLevel,
  FundingType,
  ProgramStatus,
  TargetAudience,
  isConstructionRelevant,
} from "../unified-schema";

const QUEBEC_CA_URL =
  "https://www.quebec.ca/entreprises-et-travailleurs-autonomes/aide-financiere/liste-partielle-aide-financiere";

export interface QuebecCaProgram {
  title: string;
  description: string;
  url: string;
  category: string;
}

/**
 * Main scraper for Quebec.ca
 */
export class QuebecCaScraper {
  private baseUrl = "https://www.quebec.ca";

  /**
   * Scrape all programs from Quebec.ca
   */
  async scrape(): Promise<UnifiedSubsidy[]> {
    console.log("🇨🇦 Scraping Quebec.ca...");
    const startTime = Date.now();

    try {
      // Fetch the HTML page
      const response = await fetch(QUEBEC_CA_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept-Language": "fr-CA,fr;q=0.9",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      const programs: QuebecCaProgram[] = [];

      // Parse the page structure
      // Note: Actual selectors need to be verified by inspecting the live page
      $("article, .program-item, .aide-item").each((_, element) => {
        const $el = $(element);

        const title =
          $el.find("h2, h3, .title, .program-title").first().text().trim();
        const description =
          $el.find("p, .description, .summary").first().text().trim();
        const relativeUrl = $el.find("a").first().attr("href") || "";
        const url = relativeUrl.startsWith("http")
          ? relativeUrl
          : `${this.baseUrl}${relativeUrl}`;

        const category =
          $el.closest("section").find("h2").first().text().trim() ||
          "Non catégorisé";

        if (title && url) {
          programs.push({
            title,
            description,
            url,
            category,
          });
        }
      });

      console.log(`  Found ${programs.length} programs in raw format`);

      // Convert to unified schema
      const unifiedPrograms = programs.map((p) => this.toUnifiedSchema(p));

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `✅ Quebec.ca scraping complete in ${duration}s: ${unifiedPrograms.length} programs`
      );

      return unifiedPrograms;
    } catch (error) {
      console.error("❌ Quebec.ca scraping failed:", error);
      throw error;
    }
  }

  /**
   * Convert Quebec.ca program to unified schema
   */
  private toUnifiedSchema(program: QuebecCaProgram): UnifiedSubsidy {
    // Determine funding type from title/description
    const fundingTypes = this.determineFundingTypes(
      program.title + " " + program.description
    );

    // Determine target audience
    const targetAudience = this.determineTargetAudience(
      program.title + " " + program.description + " " + program.category
    );

    // Extract any amount mentions
    const amounts = this.extractAmounts(program.description);

    const unified: UnifiedSubsidy = {
      externalId: this.generateId(program.url),
      source: SubsidySource.QUEBEC_CA,
      sourceUrl: program.url,

      programName: program.title,
      programNameFr: program.title,
      description: program.description,

      governmentLevel: GovernmentLevel.PROVINCIAL,
      fundingType: fundingTypes,
      status: ProgramStatus.ACTIVE,

      organization: "Gouvernement du Québec",
      department: this.mapCategoryToDepartment(program.category),

      minAmount: amounts.min,
      maxAmount: amounts.max,

      eligibilityCriteria: [],
      targetAudience,

      provinces: ["QC"],
      regions: [],
      isQuebecOnly: true,

      sectors: [program.category],
      isConstructionRelevant: isConstructionRelevant({
        programName: program.title,
        description: program.description,
        sectors: [program.category],
      }),

      applicationSteps: [],
      requiredDocuments: [],

      deadlineText: undefined,
      isContinuous: true, // Most Quebec.ca programs are continuous

      scrapedAt: new Date(),

      rawData: program,
    };

    return unified;
  }

  /**
   * Determine funding types from text
   */
  private determineFundingTypes(text: string): FundingType[] {
    const lower = text.toLowerCase();
    const types: FundingType[] = [];

    if (lower.includes("subvention")) types.push(FundingType.GRANT);
    if (lower.includes("prêt")) types.push(FundingType.LOAN);
    if (lower.includes("crédit d'impôt") || lower.includes("crédit impôt"))
      types.push(FundingType.TAX_CREDIT);
    if (lower.includes("contribution")) types.push(FundingType.CONTRIBUTION);
    if (lower.includes("remboursement")) types.push(FundingType.REBATE);
    if (lower.includes("garantie")) types.push(FundingType.GUARANTEE);
    if (lower.includes("capital") || lower.includes("investissement"))
      types.push(FundingType.EQUITY);

    return types.length > 0 ? types : [FundingType.GRANT]; // Default
  }

  /**
   * Determine target audience from text
   */
  private determineTargetAudience(text: string): TargetAudience[] {
    const lower = text.toLowerCase();
    const audiences: TargetAudience[] = [];

    if (lower.includes("pme") || lower.includes("entreprise"))
      audiences.push(TargetAudience.SME);
    if (lower.includes("startup") || lower.includes("jeune entreprise"))
      audiences.push(TargetAudience.STARTUP);
    if (lower.includes("obnl") || lower.includes("organisme"))
      audiences.push(TargetAudience.NONPROFIT);
    if (lower.includes("coopérative")) audiences.push(TargetAudience.COOPERATIVE);
    if (lower.includes("citoyen") || lower.includes("particulier"))
      audiences.push(TargetAudience.CITIZEN);
    if (lower.includes("municipalité"))
      audiences.push(TargetAudience.MUNICIPALITY);
    if (lower.includes("autochtone") || lower.includes("première nation"))
      audiences.push(TargetAudience.INDIGENOUS);
    if (lower.includes("économie sociale"))
      audiences.push(TargetAudience.SOCIAL_ECONOMY);

    return audiences.length > 0 ? audiences : [TargetAudience.SME]; // Default
  }

  /**
   * Extract monetary amounts from text
   */
  private extractAmounts(text: string): { min?: number; max?: number } {
    const amounts: { min?: number; max?: number } = {};

    // Match patterns like "jusqu'à 50 000 $" or "maximum de 100000$"
    const maxMatch = text.match(/jusqu'à|maximum de|max\.?\s*:?\s*([\d\s]+)\s*\$/i);
    if (maxMatch) {
      const numStr = maxMatch[1].replace(/\s/g, "");
      amounts.max = parseInt(numStr, 10);
    }

    // Match patterns like "minimum de 10 000 $"
    const minMatch = text.match(/minimum de|min\.?\s*:?\s*([\d\s]+)\s*\$/i);
    if (minMatch) {
      const numStr = minMatch[1].replace(/\s/g, "");
      amounts.min = parseInt(numStr, 10);
    }

    return amounts;
  }

  /**
   * Map category to government department
   */
  private mapCategoryToDepartment(category: string): string {
    const lower = category.toLowerCase();

    if (lower.includes("agriculture") || lower.includes("environnement"))
      return "MAPAQ / MELCCFP";
    if (lower.includes("culture")) return "MCC";
    if (lower.includes("entrepreneuriat") || lower.includes("économique"))
      return "MEIE";
    if (lower.includes("habitation")) return "MSSS / SHQ";
    if (lower.includes("innovation") || lower.includes("recherche"))
      return "MEIE / MEI";
    if (lower.includes("transport")) return "MTQ";

    return "Gouvernement du Québec";
  }

  /**
   * Generate consistent ID from URL
   */
  private generateId(url: string): string {
    const hash = url
      .split("/")
      .pop()
      ?.replace(/[^a-z0-9]/gi, "_") || "unknown";
    return `qc_${hash}`;
  }
}

/**
 * Standalone function for testing
 */
export async function testQuebecCaScraper() {
  console.log("\n🧪 Testing Quebec.ca Scraper\n");

  const scraper = new QuebecCaScraper();

  try {
    const programs = await scraper.scrape();

    console.log("\n📊 Results:");
    console.log(`  Total programs: ${programs.length}`);
    console.log(
      `  Construction-relevant: ${programs.filter((p) => p.isConstructionRelevant).length}`
    );
    console.log(
      `  Funding types: ${[...new Set(programs.flatMap((p) => p.fundingType))].join(", ")}`
    );

    console.log("\n📋 Sample programs:");
    programs.slice(0, 3).forEach((p, i) => {
      console.log(`\n${i + 1}. ${p.programName}`);
      console.log(`   Source: ${p.source}`);
      console.log(`   Types: ${p.fundingType.join(", ")}`);
      console.log(`   URL: ${p.sourceUrl}`);
    });

    return programs;
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    throw error;
  }
}

// Run test if executed directly
if (require.main === module) {
  testQuebecCaScraper();
}
