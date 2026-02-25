import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import { parseArgs } from "node:util";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import {
  extractJenkinsAuthFromHeaders,
  JenkinsRuntime,
  loadLifespanContextFromEnv
} from "./mcp-server/context.js";
import { createJenkinsMcpServer } from "./mcp-server/mcp.js";

export type TransportMode = "stdio" | "sse" | "streamable-http";

export interface CliOptions {
  jenkinsUrl?: string | undefined;
  jenkinsUsername?: string | undefined;
  jenkinsPassword?: string | undefined;
  jenkinsTimeout: number;
  jenkinsVerifySsl: boolean;
  readOnly: boolean;
  toolRegex: string;
  jenkinsSessionSingleton: boolean;
  transport: TransportMode;
  host: string;
  port: number;
}

function parseNumberOption(rawValue: string, optionName: string): number {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for --${optionName}: ${rawValue}`);
  }
  return parsed;
}

function parseTransportOption(rawValue: string): TransportMode {
  if (rawValue === "stdio" || rawValue === "sse" || rawValue === "streamable-http") {
    return rawValue;
  }

  throw new Error(`Invalid --transport value: ${rawValue}. Use stdio, sse, or streamable-http.`);
}

function getHeaderValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return undefined;
  }

  return JSON.parse(raw);
}

function sendJsonRpcError(res: ServerResponse, status: number, message: string): void {
  if (res.headersSent) {
    return;
  }

  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32_000,
        message
      },
      id: null
    })
  );
}

async function startStdioServer(options: CliOptions): Promise<void> {
  const lifespanContext = loadLifespanContextFromEnv(process.env);
  const runtime = new JenkinsRuntime(lifespanContext);

  const server = createJenkinsMcpServer({ runtime, readOnly: options.readOnly });
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

async function startSseServer(options: CliOptions): Promise<void> {
  const lifespanContext = loadLifespanContextFromEnv(process.env);

  const sessions = new Map<
    string,
    {
      transport: SSEServerTransport;
      runtime: JenkinsRuntime;
    }
  >();

  const server = createServer((req, res) => {
    void (async () => {
      try {
        const hostHeader = req.headers.host ?? `${options.host}:${options.port}`;
        const url = new URL(req.url ?? "/", `http://${hostHeader}`);

        if (req.method === "GET" && url.pathname === "/sse") {
          const runtime = new JenkinsRuntime(
            lifespanContext,
            extractJenkinsAuthFromHeaders(req.headers)
          );
          const mcpServer = createJenkinsMcpServer({ runtime, readOnly: options.readOnly });
          const transport = new SSEServerTransport("/message", res);

          transport.onclose = () => {
            sessions.delete(transport.sessionId);
          };

          sessions.set(transport.sessionId, { transport, runtime });
          await mcpServer.connect(transport as never);
          return;
        }

        if (req.method === "POST" && url.pathname === "/message") {
          const sessionId = url.searchParams.get("sessionId");
          if (!sessionId || !sessions.has(sessionId)) {
            res.statusCode = 404;
            res.end("Session not found");
            return;
          }

          const session = sessions.get(sessionId);
          if (!session) {
            res.statusCode = 404;
            res.end("Session not found");
            return;
          }

          session.runtime.setHeaderAuth(extractJenkinsAuthFromHeaders(req.headers));
          await session.transport.handlePostMessage(req, res);
          return;
        }

        res.statusCode = 404;
        res.end("Not found");
      } catch (error) {
        res.statusCode = 500;
        res.end(error instanceof Error ? error.message : "Internal error");
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => resolve());
  });

  console.error(`[mcp-jenkins] SSE server listening on http://${options.host}:${options.port}/sse`);
}

async function startStreamableHttpServer(options: CliOptions): Promise<void> {
  const lifespanContext = loadLifespanContextFromEnv(process.env);

  const sessions = new Map<
    string,
    {
      transport: StreamableHTTPServerTransport;
      runtime: JenkinsRuntime;
    }
  >();

  const server = createServer((req, res) => {
    void (async () => {
      try {
        const hostHeader = req.headers.host ?? `${options.host}:${options.port}`;
        const url = new URL(req.url ?? "/", `http://${hostHeader}`);

        if (url.pathname !== "/mcp") {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }

        const sessionId = getHeaderValue(req.headers, "mcp-session-id");
        const parsedBody = req.method === "POST" ? await parseJsonBody(req) : undefined;

        if (sessionId) {
          const existing = sessions.get(sessionId);
          if (!existing) {
            sendJsonRpcError(res, 404, "Invalid session ID");
            return;
          }

          existing.runtime.setHeaderAuth(extractJenkinsAuthFromHeaders(req.headers));
          await existing.transport.handleRequest(req, res, parsedBody);
          return;
        }

        if (req.method === "POST" && isInitializeRequest(parsedBody)) {
          const runtime = new JenkinsRuntime(
            lifespanContext,
            extractJenkinsAuthFromHeaders(req.headers)
          );
          const mcpServer = createJenkinsMcpServer({ runtime, readOnly: options.readOnly });

          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
              sessions.set(newSessionId, { transport, runtime });
            }
          });

          transport.onclose = () => {
            const currentSessionId = transport.sessionId;
            if (currentSessionId) {
              sessions.delete(currentSessionId);
            }
          };

          await mcpServer.connect(transport as unknown as Parameters<typeof mcpServer.connect>[0]);
          await transport.handleRequest(req, res, parsedBody);
          return;
        }

        sendJsonRpcError(res, 400, "Bad Request: No valid session ID provided");
      } catch (error) {
        sendJsonRpcError(
          res,
          500,
          error instanceof Error ? error.message : "Internal server error"
        );
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => resolve());
  });

  console.error(
    `[mcp-jenkins] Streamable HTTP server listening on http://${options.host}:${options.port}/mcp`
  );
}

export function parseCliArgs(argv: string[]): CliOptions {
  const parsed = parseArgs({
    args: argv,
    options: {
      "jenkins-url": { type: "string" },
      "jenkins-username": { type: "string" },
      "jenkins-password": { type: "string" },
      "jenkins-timeout": { type: "string", default: "5" },
      "jenkins-verify-ssl": { type: "boolean" },
      "no-jenkins-verify-ssl": { type: "boolean" },
      "read-only": { type: "boolean", default: false },
      "tool-regex": { type: "string", default: "" },
      "jenkins-session-singleton": { type: "boolean" },
      "no-jenkins-session-singleton": { type: "boolean" },
      transport: { type: "string", default: "stdio" },
      host: { type: "string", default: "0.0.0.0" },
      port: { type: "string", default: "9887" }
    },
    allowPositionals: false
  });

  const timeout = parseNumberOption(parsed.values["jenkins-timeout"], "jenkins-timeout");
  const transport = parseTransportOption(parsed.values.transport);
  const port = parseNumberOption(parsed.values.port, "port");

  const jenkinsVerifySsl = parsed.values["no-jenkins-verify-ssl"]
    ? false
    : (parsed.values["jenkins-verify-ssl"] ?? true);

  const jenkinsSessionSingleton = parsed.values["no-jenkins-session-singleton"]
    ? false
    : (parsed.values["jenkins-session-singleton"] ?? true);

  return {
    jenkinsUrl: parsed.values["jenkins-url"],
    jenkinsUsername: parsed.values["jenkins-username"],
    jenkinsPassword: parsed.values["jenkins-password"],
    jenkinsTimeout: timeout,
    jenkinsVerifySsl,
    readOnly: parsed.values["read-only"],
    toolRegex: parsed.values["tool-regex"],
    jenkinsSessionSingleton,
    transport,
    host: parsed.values.host,
    port
  };
}

export function applyCliEnv(options: CliOptions, env: NodeJS.ProcessEnv = process.env): void {
  if (options.jenkinsUrl) {
    env.jenkins_url = options.jenkinsUrl;
  }
  if (options.jenkinsUsername) {
    env.jenkins_username = options.jenkinsUsername;
  }
  if (options.jenkinsPassword) {
    env.jenkins_password = options.jenkinsPassword;
  }

  env.jenkins_timeout = String(options.jenkinsTimeout);
  env.jenkins_verify_ssl = String(options.jenkinsVerifySsl).toLowerCase();
  env.jenkins_session_singleton = String(options.jenkinsSessionSingleton).toLowerCase();
}

export async function runCli(argv: string[]): Promise<void> {
  const options = parseCliArgs(argv);
  applyCliEnv(options);

  if (options.toolRegex) {
    console.error(
      "The [--tool-regex] option is deprecated and will be removed in future versions."
    );
  }

  if (options.transport === "stdio") {
    await startStdioServer(options);
    return;
  }

  if (options.transport === "sse") {
    await startSseServer(options);
    return;
  }

  await startStreamableHttpServer(options);
}
