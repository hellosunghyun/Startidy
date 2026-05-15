import ora from "ora";
import type { Config } from "../utils/config";
import { delay, retryWithBackoff, runWithConcurrency } from "../utils/rate-limiter";
import { GeminiService } from "./gemini";
import type { Category, CreatedList } from "../types";
import type { BatchRepoInfo } from "../prompts/classifier";
import type { Repo } from "../api/types";
import {
  fetchRepositoryReadme,
  getRepositoryNodeId,
  addRepoToGitHubLists,
} from "../api";

export interface ClassifyResult {
  repoId: string;
  success: boolean;
  categories?: string[];
  error?: string;
}

export interface ClassifyStats {
  success: number;
  failed: number;
}

/**
 * Classifies repositories and adds them to GitHub Lists
 */
export async function classifyAndAddRepos(
  config: Config,
  gemini: GeminiService,
  repos: Repo[],
  categories: Category[],
  createdLists: Map<string, CreatedList>,
): Promise<ClassifyStats> {
  const batchSize = config.classifyBatchSize;
  const totalBatches = Math.ceil(repos.length / batchSize);

  console.log(`\n📂 Classifying ${repos.length} repositories in batches of ${batchSize}...\n`);

  let success = 0;
  let failed = 0;

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, repos.length);
    const batchRepos = repos.slice(batchStart, batchEnd);

    console.log(`── Batch ${batchIdx + 1}/${totalBatches} (${batchStart + 1}-${batchEnd}) ──`);

    // Step 1: Fetch READMEs
    const batchRepoInfos = await fetchReadmesForBatch(config, batchRepos);

    // Step 2: AI classification
    const results = await classifyBatch(gemini, batchRepoInfos, categories);
    if (!results) {
      failed += batchRepos.length;
      continue;
    }

    // Step 3: Add to Lists
    const addResults = await addReposToLists(config, batchRepos, results, createdLists);

    // Count and display results
    for (const result of addResults) {
      if (result.success) {
        success++;
        console.log(`  ✅ ${result.repoId} → ${result.categories?.slice(0, 2).join(", ")}`);
      } else {
        failed++;
        console.log(`  ❌ ${result.repoId} (${result.error})`);
      }
    }

    // Delay between batches
    if (batchIdx < totalBatches - 1) {
      await delay(config.batchDelay);
    }
  }

  console.log("\n📊 Results:");
  console.log(`  ✅ Success: ${success}`);
  console.log(`  ❌ Failed: ${failed}`);

  return { success, failed };
}

async function fetchReadmesForBatch(
  config: Config,
  batchRepos: Repo[],
): Promise<BatchRepoInfo[]> {
  const spinner = ora(`Fetching README... (0/${batchRepos.length})`).start();
  let readmeCount = 0;

  const batchRepoInfos: BatchRepoInfo[] = await Promise.all(
    batchRepos.map(async (repo) => {
      const readme = await fetchRepositoryReadme(
        config.githubToken,
        repo.owner.login,
        repo.name,
      );
      readmeCount++;
      spinner.text = `Fetching README... (${readmeCount}/${batchRepos.length})`;
      return {
        id: `${repo.owner.login}/${repo.name}`,
        description: repo.description,
        language: repo.language,
        stars: repo.stargazers_count,
        readme,
      };
    }),
  );

  spinner.succeed(`README fetched (${batchRepos.length})`);
  return batchRepoInfos;
}

async function classifyBatch(
  gemini: GeminiService,
  batchRepoInfos: BatchRepoInfo[],
  categories: Category[],
): Promise<Map<string, string[]> | null> {
  const spinner = ora("AI classifying...").start();

  try {
    const results = await gemini.classifyRepositoriesBatch(batchRepoInfos, categories);
    spinner.succeed("Classification complete");
    return results;
  } catch (error) {
    spinner.fail(`Classification failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function addReposToLists(
  config: Config,
  batchRepos: Repo[],
  results: Map<string, string[]>,
  createdLists: Map<string, CreatedList>,
): Promise<ClassifyResult[]> {
  const spinner = ora("Adding to Lists...").start();

  const addResults = await runWithConcurrency(
    batchRepos,
    async (repo): Promise<ClassifyResult> => {
      const repoId = `${repo.owner.login}/${repo.name}`;
      const categoryNames = results.get(repoId) || [];

      try {
        const listIds = categoryNames
          .map((name) => createdLists.get(name)?.id)
          .filter((id): id is string => !!id);

        if (listIds.length === 0) {
          return { repoId, success: false, error: "No matching category" };
        }

        // Retry with exponential backoff for GitHub API errors
        await retryWithBackoff(async () => {
          const repoNodeId = await getRepositoryNodeId(
            config.githubToken,
            repo.owner.login,
            repo.name,
          );
          await addRepoToGitHubLists(config.githubToken, repoNodeId, listIds);
        }, { maxRetries: 3, initialDelayMs: 500 });

        return { repoId, success: true, categories: categoryNames };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return { repoId, success: false, error: errMsg };
      }
    },
    5, // Concurrency limit
  );

  spinner.succeed(`Added to Lists (${batchRepos.length})`);
  return addResults;
}
