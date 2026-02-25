import { describe, expect, it, vi } from "vitest";

import type { Folder, Job } from "../../src/jenkins/model/item.js";
import type { Jenkins } from "../../src/jenkins/rest-client.js";
import {
  buildItem,
  getAllItems,
  getItem,
  getItemConfig,
  queryItems,
  setItemConfig
} from "../../src/mcp-server/item.js";
import type { ToolRuntime } from "../../src/mcp-server/runtime.js";

function createRuntime(jenkinsMock: Partial<Jenkins>): ToolRuntime {
  return {
    getJenkins: vi.fn(async () => jenkinsMock as Jenkins)
  };
}

describe("mcp-server item tools", () => {
  it("getAllItems", async () => {
    const job: Job = {
      kind: "Job",
      class_: "Job",
      color: "blue",
      fullname: "job1",
      name: "job1",
      url: "1"
    };
    const folder: Folder = {
      kind: "Folder",
      class_: "Folder",
      fullname: "job2",
      jobs: [],
      name: "folder",
      url: "1"
    };

    const jenkinsMock = {
      getItems: vi.fn(async () => [job, folder])
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(getAllItems(runtime)).resolves.toEqual([
      { class_: "Job", color: "blue", fullname: "job1", name: "job1", url: "1" },
      { class_: "Folder", fullname: "job2", jobs: [], name: "folder", url: "1" }
    ]);
  });

  it("getItem", async () => {
    const job: Job = {
      kind: "Job",
      class_: "Job",
      color: "blue",
      fullname: "job1",
      name: "job1",
      url: "1"
    };

    const jenkinsMock = {
      getItem: vi.fn(async () => job)
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(getItem(runtime, "job1")).resolves.toEqual({
      class_: "Job",
      color: "blue",
      fullname: "job1",
      name: "job1",
      url: "1"
    });
  });

  it("getItemConfig", async () => {
    const jenkinsMock = {
      getItemConfig: vi.fn(async () => "<xml>config</xml>")
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);
    await expect(getItemConfig(runtime, "job1")).resolves.toBe("<xml>config</xml>");
  });

  it("setItemConfig", async () => {
    const jenkinsMock = {
      setItemConfig: vi.fn(async () => undefined)
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);
    await setItemConfig(runtime, "job1", "<xml>config</xml>");

    expect(jenkinsMock.setItemConfig).toHaveBeenCalledWith("job1", "<xml>config</xml>");
  });

  it("queryItems", async () => {
    const job: Job = {
      kind: "Job",
      class_: "Job",
      color: "blue",
      fullname: "job1",
      name: "job1",
      url: "1"
    };

    const jenkinsMock = {
      queryItems: vi.fn(async () => [job])
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(queryItems(runtime, ".*", "job.*", "blue")).resolves.toEqual([
      { class_: "Job", color: "blue", fullname: "job1", name: "job1", url: "1" }
    ]);

    expect(jenkinsMock.queryItems).toHaveBeenCalledWith({
      classPattern: ".*",
      fullnamePattern: "job.*",
      colorPattern: "blue"
    });
  });

  it("buildItem", async () => {
    const jenkinsMock = {
      buildItem: vi.fn(async () => 123)
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(
      buildItem(runtime, "job1", "buildWithParameters", {
        param1: "value1"
      })
    ).resolves.toBe(123);

    expect(jenkinsMock.buildItem).toHaveBeenCalledWith("job1", "buildWithParameters", {
      param1: "value1"
    });
  });
});
