import { runCli } from "./cli.js";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

runCli(process.argv.slice(2)).catch((error) => {
  console.error(`[mcp-jenkins] Fatal error: ${toErrorMessage(error)}`);
  process.exit(1);
});
