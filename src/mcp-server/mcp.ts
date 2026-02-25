import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { getPackageVersion } from "../version.js";
import {
  getBuild,
  getBuildConsoleOutput,
  getBuildScripts,
  getBuildTestReport,
  getRunningBuilds,
  stopBuild
} from "./build.js";
import {
  buildItem,
  getAllItems,
  getItem,
  getItemConfig,
  queryItems,
  setItemConfig
} from "./item.js";
import { getAllNodes, getNode, getNodeConfig, setNodeConfig } from "./node.js";
import { cancelQueueItem, getAllQueueItems, getQueueItem } from "./queue.js";
import type { ToolRuntime } from "./runtime.js";

export interface CreateMcpServerOptions {
  runtime: ToolRuntime;
  readOnly: boolean;
}

function toCallToolResult(value: unknown): CallToolResult {
  if (typeof value === "string") {
    return {
      content: [{ type: "text", text: value }]
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(value ?? null) }]
  };
}

function toErrorToolResult(error: unknown): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: error instanceof Error ? error.message : String(error)
      }
    ]
  };
}

async function callTool(handler: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const value = await handler();
    return toCallToolResult(value);
  } catch (error) {
    return toErrorToolResult(error);
  }
}

export function createJenkinsMcpServer(options: CreateMcpServerOptions): McpServer {
  const { runtime, readOnly } = options;

  const server = new McpServer({
    name: "mcp-jenkins",
    version: getPackageVersion()
  });

  server.registerTool(
    "get_all_items",
    {
      description: "Get all items from Jenkins.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    async () => callTool(async () => getAllItems(runtime))
  );

  server.registerTool(
    "get_item",
    {
      description: "Get specific item from Jenkins.",
      inputSchema: z.object({ fullname: z.string() }),
      annotations: { readOnlyHint: true }
    },
    async ({ fullname }) => callTool(async () => getItem(runtime, fullname))
  );

  server.registerTool(
    "get_item_config",
    {
      description: "Get specific item config from Jenkins.",
      inputSchema: z.object({ fullname: z.string() }),
      annotations: { readOnlyHint: true }
    },
    async ({ fullname }) => callTool(async () => getItemConfig(runtime, fullname))
  );

  if (!readOnly) {
    server.registerTool(
      "set_item_config",
      {
        description: "Set specific item config in Jenkins.",
        inputSchema: z.object({ fullname: z.string(), config_xml: z.string() }),
        annotations: { readOnlyHint: false }
      },
      async ({ fullname, config_xml }) =>
        callTool(async () => setItemConfig(runtime, fullname, config_xml))
    );
  }

  server.registerTool(
    "query_items",
    {
      description: "Query items from Jenkins.",
      inputSchema: z.object({
        class_pattern: z.string().optional(),
        fullname_pattern: z.string().optional(),
        color_pattern: z.string().optional()
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ class_pattern, fullname_pattern, color_pattern }) =>
      callTool(async () => queryItems(runtime, class_pattern, fullname_pattern, color_pattern))
  );

  if (!readOnly) {
    server.registerTool(
      "build_item",
      {
        description: "Build an item in Jenkins.",
        inputSchema: z.object({
          fullname: z.string(),
          build_type: z.enum(["build", "buildWithParameters"]),
          params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
        }),
        annotations: { readOnlyHint: false }
      },
      async ({ fullname, build_type, params }) =>
        callTool(async () => buildItem(runtime, fullname, build_type, params))
    );
  }

  server.registerTool(
    "get_all_nodes",
    {
      description: "Get all nodes from Jenkins.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    async () => callTool(async () => getAllNodes(runtime))
  );

  server.registerTool(
    "get_node",
    {
      description: "Get a specific node from Jenkins.",
      inputSchema: z.object({ name: z.string() }),
      annotations: { readOnlyHint: true }
    },
    async ({ name }) => callTool(async () => getNode(runtime, name))
  );

  server.registerTool(
    "get_node_config",
    {
      description: "Get node config from Jenkins.",
      inputSchema: z.object({ name: z.string() }),
      annotations: { readOnlyHint: true }
    },
    async ({ name }) => callTool(async () => getNodeConfig(runtime, name))
  );

  if (!readOnly) {
    server.registerTool(
      "set_node_config",
      {
        description: "Set specific node config in Jenkins.",
        inputSchema: z.object({ name: z.string(), config_xml: z.string() }),
        annotations: { readOnlyHint: false }
      },
      async ({ name, config_xml }) => callTool(async () => setNodeConfig(runtime, name, config_xml))
    );
  }

  server.registerTool(
    "get_all_queue_items",
    {
      description: "Get all items in Jenkins queue.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    async () => callTool(async () => getAllQueueItems(runtime))
  );

  server.registerTool(
    "get_queue_item",
    {
      description: "Get a specific item in Jenkins queue by id.",
      inputSchema: z.object({ id: z.number().int() }),
      annotations: { readOnlyHint: true }
    },
    async ({ id }) => callTool(async () => getQueueItem(runtime, id))
  );

  if (!readOnly) {
    server.registerTool(
      "cancel_queue_item",
      {
        description: "Cancel a specific item in Jenkins queue by id.",
        inputSchema: z.object({ id: z.number().int() }),
        annotations: { readOnlyHint: false }
      },
      async ({ id }) => callTool(async () => cancelQueueItem(runtime, id))
    );
  }

  server.registerTool(
    "get_running_builds",
    {
      description: "Get all running builds from Jenkins.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    },
    async () => callTool(async () => getRunningBuilds(runtime))
  );

  server.registerTool(
    "get_build",
    {
      description: "Get specific build info from Jenkins.",
      inputSchema: z.object({
        fullname: z.string(),
        number: z.number().int().optional()
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ fullname, number }) => callTool(async () => getBuild(runtime, fullname, number))
  );

  server.registerTool(
    "get_build_scripts",
    {
      description: "Get scripts used in a specific build.",
      inputSchema: z.object({ fullname: z.string(), number: z.number().int().optional() }),
      annotations: { readOnlyHint: true }
    },
    async ({ fullname, number }) => callTool(async () => getBuildScripts(runtime, fullname, number))
  );

  server.registerTool(
    "get_build_console_output",
    {
      description: "Get console output of a specific build.",
      inputSchema: z.object({ fullname: z.string(), number: z.number().int().optional() }),
      annotations: { readOnlyHint: true }
    },
    async ({ fullname, number }) =>
      callTool(async () => getBuildConsoleOutput(runtime, fullname, number))
  );

  server.registerTool(
    "get_build_test_report",
    {
      description: "Get test report of a specific build.",
      inputSchema: z.object({ fullname: z.string(), number: z.number().int().optional() }),
      annotations: { readOnlyHint: true }
    },
    async ({ fullname, number }) =>
      callTool(async () => getBuildTestReport(runtime, fullname, number))
  );

  if (!readOnly) {
    server.registerTool(
      "stop_build",
      {
        description: "Stop a specific build.",
        inputSchema: z.object({ fullname: z.string(), number: z.number().int() }),
        annotations: { readOnlyHint: false }
      },
      async ({ fullname, number }) => callTool(async () => stopBuild(runtime, fullname, number))
    );
  }

  return server;
}
