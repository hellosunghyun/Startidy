export interface Config {
  // Required credentials
  githubToken: string;
  githubUsername: string;
  anthropicAuthToken: string;
  anthropicBaseUrl: string;

  // Category settings
  maxCategories: number; // Maximum number of categories (default: 32, GitHub limit)
  maxCategoriesPerRepo: number; // Maximum categories per repository (default: 3)
  minCategoriesPerRepo: number; // Minimum categories per repository (default: 1)

  // Batch processing settings
  classifyBatchSize: number; // Classification batch size (default: 20)
  readmeBatchSize: number; // README fetch concurrent requests (default: 20)
  listCreateDelay: number; // Delay between List creation in ms (default: 500)
  batchDelay: number; // Delay between batches in ms (default: 2000)

  // Rate limiting
  githubRequestDelay: number; // Delay between GitHub API requests in ms (default: 100)

  // Claude model settings
  claudeModel: string; // Claude model (default: claude-sonnet-4-6)
  claudeTemperaturePlanning: number; // Category planning temperature (default: 0.7)
  claudeTemperatureClassify: number; // Classification temperature (default: 0.3)
  claudeMaxTokensPlanning: number; // Category planning max tokens (default: 8192)
  claudeMaxTokensClassify: number; // Classification max tokens (default: 8192)

  // README settings
  readmeMaxLength: number; // Maximum README length (default: 500, for batch)
  readmeMaxLengthSingle: number; // Maximum README length for single classification (default: 2000)

  // List settings
  listIsPrivate: boolean; // Whether created Lists are private (default: false)
  listNameMaxLength: number; // Maximum List name length (default: 20)

  // Retry settings
  maxRetries: number; // Maximum retry count (default: 3)
  retryDelay: number; // Delay between retries in ms (default: 1000)

  // Debug settings
  debug: boolean; // Debug mode (default: false)
  logApiResponses: boolean; // Log API responses (default: false)
}

function parseIntEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseFloatEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseBoolEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

export function loadConfig(): Config {
  const githubToken = process.env.GITHUB_TOKEN;
  const githubUsername = process.env.GITHUB_USERNAME;
  const anthropicAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;

  if (!githubToken) {
    throw new Error(
      "GITHUB_TOKEN environment variable is required. Please check your .env file.",
    );
  }

  if (!githubUsername) {
    throw new Error(
      "GITHUB_USERNAME environment variable is required. Please check your .env file.",
    );
  }

  if (!anthropicAuthToken) {
    throw new Error(
      "ANTHROPIC_AUTH_TOKEN environment variable is required. Please check your .env file.",
    );
  }

  return {
    // Required credentials
    githubToken,
    githubUsername,
    anthropicAuthToken,
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",

    // Category settings
    maxCategories: parseIntEnv("MAX_CATEGORIES", 32),
    maxCategoriesPerRepo: parseIntEnv("MAX_CATEGORIES_PER_REPO", 3),
    minCategoriesPerRepo: parseIntEnv("MIN_CATEGORIES_PER_REPO", 1),

    // Batch processing settings
    classifyBatchSize: parseIntEnv("CLASSIFY_BATCH_SIZE", 20),
    readmeBatchSize: parseIntEnv("README_BATCH_SIZE", 20),
    listCreateDelay: parseIntEnv("LIST_CREATE_DELAY", 500),
    batchDelay: parseIntEnv("BATCH_DELAY", 2000),

    // Rate limiting
    githubRequestDelay: parseIntEnv("GITHUB_REQUEST_DELAY", 100),

    // Claude model settings
    claudeModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    claudeTemperaturePlanning: parseFloatEnv("CLAUDE_TEMPERATURE_PLANNING", 0.7),
    claudeTemperatureClassify: parseFloatEnv("CLAUDE_TEMPERATURE_CLASSIFY", 0.3),
    claudeMaxTokensPlanning: parseIntEnv("CLAUDE_MAX_TOKENS_PLANNING", 8192),
    claudeMaxTokensClassify: parseIntEnv("CLAUDE_MAX_TOKENS_CLASSIFY", 8192),

    // README settings
    readmeMaxLength: parseIntEnv("README_MAX_LENGTH", 10000),
    readmeMaxLengthSingle: parseIntEnv("README_MAX_LENGTH_SINGLE", 10000),

    // List settings
    listIsPrivate: parseBoolEnv("LIST_IS_PRIVATE", false),
    listNameMaxLength: parseIntEnv("LIST_NAME_MAX_LENGTH", 20),

    // Retry settings
    maxRetries: parseIntEnv("MAX_RETRIES", 3),
    retryDelay: parseIntEnv("RETRY_DELAY", 1000),

    // Debug settings
    debug: parseBoolEnv("DEBUG", false),
    logApiResponses: parseBoolEnv("LOG_API_RESPONSES", false),
  };
}

// Singleton config instance
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function resetConfig(): void {
  configInstance = null;
}
