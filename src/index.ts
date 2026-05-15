#!/usr/bin/env node
import { config } from "dotenv";
import { Command } from "commander";
import { listsCommand } from "./commands/lists";
import { planCommand } from "./commands/plan";
import { createListsCommand } from "./commands/create-lists";
import { classifyCommand } from "./commands/classify";
import { runCommand } from "./commands/run";
import { checkForUpdates } from "./utils/update-checker";

// Load .env file from current working directory
config();

// Check for updates in the background (non-blocking)
void checkForUpdates();

const program = new Command();

program
  .name("startidy")
  .description("AI-powered CLI tool to automatically organize your GitHub Stars into Lists")
  .version("1.0.0")
  .option("--token <token>", "GitHub Personal Access Token")
  .option("--username <username>", "GitHub Username")
  .option("--api-key <key>", "LLM API Key")
  .option("--max-categories <number>", "Maximum categories (default: 32)")
  .option("--batch-size <number>", "Batch size for classification (default: 20)")
  .option("--private", "Create private Lists")
  .option("--debug", "Enable debug mode")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();

    // Set environment variables from CLI options
    if (opts.token) process.env.GITHUB_TOKEN = opts.token;
    if (opts.username) process.env.GITHUB_USERNAME = opts.username;
    if (opts.apiKey) process.env.LLM_API_KEY = opts.apiKey;
    if (opts.maxCategories) process.env.MAX_CATEGORIES = opts.maxCategories;
    if (opts.batchSize) process.env.CLASSIFY_BATCH_SIZE = opts.batchSize;
    if (opts.private) process.env.LIST_IS_PRIVATE = "true";
    if (opts.debug) process.env.DEBUG = "true";
  });

// Individual step commands
program.addCommand(listsCommand);       // lists - View/delete Lists
program.addCommand(planCommand);        // plan - Plan categories
program.addCommand(createListsCommand); // create-lists - Create Lists
program.addCommand(classifyCommand);    // classify - Classify and add Stars

// Full auto execution
program.addCommand(runCommand);         // run - Full workflow

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
