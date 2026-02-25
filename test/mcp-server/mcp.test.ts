import { describe, expect, it, vi } from "vitest";

import type { Jenkins } from "../../src/jenkins/rest-client.js";
import { createJenkinsMcpServer } from "../../src/mcp-server/mcp.js";
import type { ToolRuntime } from "../../src/mcp-server/runtime.js";

function createRuntime(): ToolRuntime {
  const jenkinsMock = {
    getItems: vi.fn(async () => []),
    getItem: vi.fn(async () => ({
      kind: "Job",
      class_: "Job",
      name: "job",
      url: "u",
      color: "blue"
    })),
    getItemConfig: vi.fn(async () => ""),
    setItemConfig: vi.fn(async () => undefined),
    queryItems: vi.fn(async () => []),
    buildItem: vi.fn(async () => 1),
    getNodes: vi.fn(async () => []),
    getNode: vi.fn(async () => ({ displayName: "node", offline: false, executors: [] })),
    getNodeConfig: vi.fn(async () => ""),
    setNodeConfig: vi.fn(async () => undefined),
    getQueue: vi.fn(async () => ({ discoverableItems: [], items: [] })),
    getQueueItem: vi.fn(async () => ({ id: 1, inQueueSince: 1, url: "u", why: null, task: {} })),
    cancelQueueItem: vi.fn(async () => undefined),
    getRunningBuilds: vi.fn(async () => []),
    getBuild: vi.fn(async () => ({ number: 1, url: "u" })),
    getBuildReplay: vi.fn(async () => ({ scripts: [] })),
    getBuildConsoleOutput: vi.fn(async () => ""),
    getBuildTestReport: vi.fn(async () => ({})),
    stopBuild: vi.fn(async () => undefined)
  } as unknown as Jenkins;

  return {
    getJenkins: vi.fn(async () => jenkinsMock)
  };
}

describe("mcp tool registration", () => {
  it("registers write tools when readOnly is false", () => {
    const server = createJenkinsMcpServer({ runtime: createRuntime(), readOnly: false });
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;

    expect("set_item_config" in tools).toBe(true);
    expect("build_item" in tools).toBe(true);
    expect("set_node_config" in tools).toBe(true);
    expect("cancel_queue_item" in tools).toBe(true);
    expect("stop_build" in tools).toBe(true);
  });

  it("skips write tools when readOnly is true", () => {
    const server = createJenkinsMcpServer({ runtime: createRuntime(), readOnly: true });
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;

    expect("set_item_config" in tools).toBe(false);
    expect("build_item" in tools).toBe(false);
    expect("set_node_config" in tools).toBe(false);
    expect("cancel_queue_item" in tools).toBe(false);
    expect("stop_build" in tools).toBe(false);

    expect("get_item" in tools).toBe(true);
    expect("get_node" in tools).toBe(true);
    expect("get_build" in tools).toBe(true);
  });
});
