import { describe, expect, it, vi } from "vitest";

import type { Queue, QueueItem } from "../../src/jenkins/model/queue.js";
import type { Jenkins } from "../../src/jenkins/rest-client.js";
import { cancelQueueItem, getAllQueueItems, getQueueItem } from "../../src/mcp-server/queue.js";
import type { ToolRuntime } from "../../src/mcp-server/runtime.js";

function createRuntime(jenkinsMock: Partial<Jenkins>): ToolRuntime {
  return {
    getJenkins: vi.fn(async () => jenkinsMock as Jenkins)
  };
}

describe("mcp-server queue tools", () => {
  it("getAllQueueItems", async () => {
    const qItem1: QueueItem = {
      id: 1,
      inQueueSince: 1,
      url: "1",
      why: "1",
      task: {}
    };
    const qItem2: QueueItem = {
      id: 2,
      inQueueSince: 2,
      url: "2",
      why: "2",
      task: {}
    };

    const queue: Queue = {
      discoverableItems: [],
      items: [qItem1, qItem2]
    };

    const jenkinsMock = {
      getQueue: vi.fn(async () => queue)
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(getAllQueueItems(runtime)).resolves.toEqual([
      { id: 1, inQueueSince: 1, url: "1", why: "1" },
      { id: 2, inQueueSince: 2, url: "2", why: "2" }
    ]);
  });

  it("getQueueItem", async () => {
    const qItem: QueueItem = {
      id: 1,
      inQueueSince: 1,
      url: "1",
      why: "1",
      task: {
        fullDisplayName: "1",
        name: "1",
        url: "1"
      }
    };

    const jenkinsMock = {
      getQueueItem: vi.fn(async () => qItem)
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(getQueueItem(runtime, 1)).resolves.toEqual({
      id: 1,
      inQueueSince: 1,
      url: "1",
      why: "1",
      task: {
        fullDisplayName: "1",
        name: "1",
        url: "1"
      }
    });
  });

  it("cancelQueueItem", async () => {
    const jenkinsMock = {
      cancelQueueItem: vi.fn(async () => undefined)
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await cancelQueueItem(runtime, 1);

    expect(jenkinsMock.cancelQueueItem).toHaveBeenCalledWith(1);
  });
});
