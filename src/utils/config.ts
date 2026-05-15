export interface Config {
  // Required credentials
  githubToken: string;
  githubUsername: string;
  llmApiKey: string;
  llmBaseUrl: string;

  // Category settings
  maxCategories: number;
  maxCategoriesPerRepo: number;
  minCategoriesPerRepo: number;

  // Batch processing settings
  classifyBatchSize: number;
  readmeBatchSize: number;
  listCreateDelay: number;
  batchDelay: number;

  // Rate limiting
  githubRequestDelay: number;

  // LLM model settings
  llmModel: string;
  llmTemperaturePlanning: number;
  llmTemperatureClassify: number;
  llmMaxTokensPlanning: number;
  llmMaxTokensClassify: number;

  // README settings
  readmeMaxLength: number;
  readmeMaxLengthSingle: number;

  // List settings
  listIsPrivate: boolean;
  listNameMaxLength: number;

  // Retry settings
  maxRetries: number;
  retryDelay: number;

  // Debug settings
  debug: boolean;
  logApiResponses: boolean;
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
  const llmApiKey = process.env.LLM_API_KEY;

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

  if (!llmApiKey) {
    throw new Error(
      "LLM_API_KEY environment variable is required. Please check your .env file.",
    );
  }

  return {
    // Required credentials
    githubToken,
    githubUsername,
    llmApiKey,
    llmBaseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",

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

    // LLM model settings
    llmModel: process.env.LLM_MODEL || "gpt-4o-mini",
    llmTemperaturePlanning: parseFloatEnv("LLM_TEMPERATURE_PLANNING", 0.7),
    llmTemperatureClassify: parseFloatEnv("LLM_TEMPERATURE_CLASSIFY", 0.3),
    llmMaxTokensPlanning: parseIntEnv("LLM_MAX_TOKENS_PLANNING", 8192),
    llmMaxTokensClassify: parseIntEnv("LLM_MAX_TOKENS_CLASSIFY", 8192),

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
