import { describe, expect, it, vi } from "vitest";

import type { Node } from "../../src/jenkins/model/node.js";
import type { Jenkins } from "../../src/jenkins/rest-client.js";
import { getAllNodes, getNode, getNodeConfig, setNodeConfig } from "../../src/mcp-server/node.js";
import type { ToolRuntime } from "../../src/mcp-server/runtime.js";

function createRuntime(jenkinsMock: Partial<Jenkins>): ToolRuntime {
  return {
    getJenkins: vi.fn(async () => jenkinsMock as Jenkins)
  };
}

describe("mcp-server node tools", () => {
  it("getAllNodes", async () => {
    const node1: Node = { displayName: "node1", offline: false, executors: [] };
    const node2: Node = { displayName: "node2", offline: true, executors: [] };

    const jenkinsMock = {
      getNodes: vi.fn(async () => [node1, node2])
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(getAllNodes(runtime)).resolves.toEqual([
      { displayName: "node1", offline: false },
      { displayName: "node2", offline: true }
    ]);
  });

  it("getNode", async () => {
    const node1: Node = { displayName: "node1", offline: false, executors: [] };

    const jenkinsMock = {
      getNode: vi.fn(async () => node1)
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(getNode(runtime, "node1")).resolves.toEqual({
      displayName: "node1",
      offline: false,
      executors: []
    });
  });

  it("getNodeConfig", async () => {
    const jenkinsMock = {
      getNodeConfig: vi.fn(async () => "<node>config</node>")
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(getNodeConfig(runtime, "node1")).resolves.toBe("<node>config</node>");
  });

  it("setNodeConfig", async () => {
    const jenkinsMock = {
      setNodeConfig: vi.fn(async () => undefined)
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await setNodeConfig(runtime, "node1", "<node>config</node>");

    expect(jenkinsMock.setNodeConfig).toHaveBeenCalledWith("node1", "<node>config</node>");
  });
});
