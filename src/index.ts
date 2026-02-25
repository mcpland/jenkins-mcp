import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfigFromEnv } from "./config.js";
import { createJenkinsMcpServer } from "./server.js";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

async function main(): Promise<void> {
  const config = loadConfigFromEnv();
  const server = createJenkinsMcpServer(config);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error(`[jenkins-mcp] Ready. Connected to Jenkins at ${config.baseUrl.origin}`);
}

main().catch((error) => {
  console.error(`[jenkins-mcp] Fatal error: ${toErrorMessage(error)}`);
  process.exit(1);
});
