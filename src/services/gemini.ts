import Anthropic from "@anthropic-ai/sdk";
import type {
  Category,
  ClassificationResult,
  RepoDetail,
  RepoSummary,
} from "../types";
import type { Config } from "../utils/config";
import { buildCategoryPlannerPrompt } from "../prompts/category-planner";
import {
  buildClassifierPrompt,
  buildBatchClassifierPrompt,
  type BatchRepoInfo,
} from "../prompts/classifier";

export interface BatchClassificationResult {
  id: string;
  categories: string[];
}

export class GeminiService {
  private client: Anthropic;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.anthropicAuthToken,
      baseURL: config.anthropicBaseUrl,
    });
  }

  async planCategories(repos: RepoSummary[]): Promise<Category[]> {
    const prompt = buildCategoryPlannerPrompt(repos, this.config);

    const response = await this.client.messages.create({
      model: this.config.claudeModel,
      max_tokens: this.config.claudeMaxTokensPlanning,
      system:
        'You are a GitHub repository categorization expert. Always respond with valid JSON only, no markdown fences, no explanation. Format: {"categories":[{"name":"...","description":"..."}]}',
      messages: [{ role: "user", content: prompt }],
      temperature: this.config.claudeTemperaturePlanning,
    });

    const text = (response.content[0] as { type: "text"; text: string }).text || "";

    if (this.config.logApiResponses) {
      console.log("\n[DEBUG] Claude Planning Response:", text);
    }

    try {
      const jsonStr = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
      const parsed = JSON.parse(jsonStr);
      const categories = parsed.categories.map((c: { name: string; description: string }) => ({
        name: c.name || "Unnamed",
        description: c.description || "",
        keywords: [],
      }));

      if (categories.length !== this.config.maxCategories) {
        console.warn(
          `Warning: Expected ${this.config.maxCategories} categories, got ${categories.length}`,
        );
      }

      return categories;
    } catch (error) {
      console.error("Failed to parse category response:", error);
      if (this.config.debug) {
        console.error("Raw response:", text);
      }
      throw new Error("Failed to parse Claude category response");
    }
  }

  async classifyRepositoriesBatch(
    repos: BatchRepoInfo[],
    categories: Category[],
  ): Promise<Map<string, string[]>> {
    const prompt = buildBatchClassifierPrompt(repos, categories, this.config);

    const response = await this.client.messages.create({
      model: this.config.claudeModel,
      max_tokens: this.config.claudeMaxTokensClassify,
      system:
        'You are a GitHub repository classifier. Always respond with valid JSON only, no markdown fences, no explanation. Format: {"results":[{"id":"owner/repo","categories":["Cat: Name"]}]}',
      messages: [{ role: "user", content: prompt }],
      temperature: this.config.claudeTemperatureClassify,
    });

    const text = (response.content[0] as { type: "text"; text: string }).text || "";

    if (this.config.logApiResponses) {
      console.log("\n[DEBUG] Claude Classify Response:", text);
    }

    return this.parseBatchClassifierResponse(text, repos, categories);
  }

  async classifyRepository(
    repo: RepoDetail,
    categories: Category[],
  ): Promise<ClassificationResult> {
    const prompt = buildClassifierPrompt(repo, categories, this.config);

    const response = await this.client.messages.create({
      model: this.config.claudeModel,
      max_tokens: 512,
      system:
        'You are a GitHub repository classifier. Always respond with valid JSON only, no markdown fences. Format: {"categories":["Cat: Name"]}',
      messages: [{ role: "user", content: prompt }],
      temperature: this.config.claudeTemperatureClassify,
    });

    const text = (response.content[0] as { type: "text"; text: string }).text || "";

    if (this.config.logApiResponses) {
      console.log("\n[DEBUG] Claude Single Classify Response:", text);
    }

    return this.parseClassifierResponse(text, categories);
  }

  private parseBatchClassifierResponse(
    text: string,
    repos: BatchRepoInfo[],
    categories: Category[],
  ): Map<string, string[]> {
    const resultMap = new Map<string, string[]>();
    const validCategoryNames = new Set(categories.map((c) => c.name));
    const defaultCategory = categories[0]?.name || "Lang: ETC";

    try {
      let jsonStr = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");

      // Attempt to recover truncated JSON
      if (!jsonStr.endsWith("}")) {
        const openBraces = (jsonStr.match(/\{/g) || []).length;
        const closeBraces = (jsonStr.match(/\}/g) || []).length;
        const openBrackets = (jsonStr.match(/\[/g) || []).length;
        const closeBrackets = (jsonStr.match(/\]/g) || []).length;

        const lastCompleteIdx = jsonStr.lastIndexOf("}");
        if (lastCompleteIdx > 0) {
          const afterLast = jsonStr.slice(lastCompleteIdx + 1);
          if (afterLast.includes("{") && !afterLast.includes("}")) {
            jsonStr = jsonStr.slice(0, lastCompleteIdx + 1);
          }
        }

        jsonStr += "]".repeat(Math.max(0, openBrackets - closeBrackets));
        jsonStr += "}".repeat(Math.max(0, openBraces - closeBraces));
      }

      const parsed = JSON.parse(jsonStr);

      if (!parsed.results || !Array.isArray(parsed.results)) {
        throw new Error("Invalid response structure");
      }

      for (const result of parsed.results) {
        if (!result.id || !Array.isArray(result.categories)) continue;

        const validCategories = result.categories
          .filter((c: string) => validCategoryNames.has(c))
          .slice(0, this.config.maxCategoriesPerRepo);

        resultMap.set(
          result.id,
          validCategories.length > 0 ? validCategories : [defaultCategory],
        );
      }

      for (const repo of repos) {
        if (!resultMap.has(repo.id)) {
          resultMap.set(repo.id, [defaultCategory]);
        }
      }
    } catch (error) {
      console.error("Failed to parse batch classifier response:", error);
      if (this.config.debug) {
        console.error("Raw response:", text);
      }

      const linePattern = /"id"\s*:\s*"([^"]+)"[^}]*"categories"\s*:\s*\[([^\]]*)\]/g;
      let match;
      while ((match = linePattern.exec(text)) !== null) {
        const id = match[1];
        const categoriesStr = match[2];
        const cats = categoriesStr
          .split(",")
          .map((s) => s.trim().replace(/"/g, ""))
          .filter((c) => validCategoryNames.has(c))
          .slice(0, this.config.maxCategoriesPerRepo);

        if (cats.length > 0 && !resultMap.has(id)) {
          resultMap.set(id, cats);
        }
      }

      for (const repo of repos) {
        if (!resultMap.has(repo.id)) {
          resultMap.set(repo.id, [defaultCategory]);
        }
      }
    }

    return resultMap;
  }

  private parseClassifierResponse(
    text: string,
    categories: Category[],
  ): ClassificationResult {
    try {
      const jsonStr = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
      const parsed = JSON.parse(jsonStr);

      if (!parsed.categories || !Array.isArray(parsed.categories)) {
        throw new Error("Invalid response structure");
      }

      const validCategoryNames = new Set(categories.map((c) => c.name));
      const validatedCategories = parsed.categories
        .filter((c: string) => validCategoryNames.has(c))
        .slice(0, this.config.maxCategoriesPerRepo);

      if (validatedCategories.length === 0) {
        validatedCategories.push(categories[0].name);
      }

      return { categories: validatedCategories, reason: "" };
    } catch (error) {
      console.error("Failed to parse classifier response:", error);
      if (this.config.debug) {
        console.error("Raw response:", text);
      }
      return {
        categories: [categories[0].name],
        reason: "Parsing failed, using default category",
      };
    }
  }
}
