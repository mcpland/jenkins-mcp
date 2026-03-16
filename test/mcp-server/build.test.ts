import { describe, expect, it, vi } from "vitest";

import type { Build } from "../../src/jenkins/model/build.js";
import type { Job } from "../../src/jenkins/model/item.js";
import type { Jenkins } from "../../src/jenkins/rest-client.js";
import {
  getBuild,
  getBuildConsoleChunk,
  getBuildConsoleOutput,
  getBuildConsoleTail,
  getBuildScripts,
  getBuildTestReport,
  getRunningBuilds,
  searchBuildConsole,
  stopBuild
} from "../../src/mcp-server/build.js";
import type { ToolRuntime } from "../../src/mcp-server/runtime.js";

function createRuntime(jenkinsMock: Partial<Jenkins>): ToolRuntime {
  return {
    getJenkins: vi.fn(async () => jenkinsMock as Jenkins)
  };
}

describe("mcp-server build tools", () => {
  it("getRunningBuilds", async () => {
    const build1: Build = { number: 1, url: "1", building: true, timestamp: 1234567890 };
    const build2: Build = { number: 2, url: "2", building: true, timestamp: 1234567891 };

    const jenkinsMock = {
      getRunningBuilds: vi.fn(async () => [build1, build2])
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(getRunningBuilds(runtime)).resolves.toEqual([
      { number: 1, url: "1", building: true, timestamp: 1234567890 },
      { number: 2, url: "2", building: true, timestamp: 1234567891 }
    ]);
  });

  it("getBuild defaults to last build number", async () => {
    const item: Job = {
      kind: "Job",
      class_: "Job",
      color: "blue",
      fullname: "job1",
      name: "job1",
      url: "1",
      lastBuild: { number: 1, url: "1" }
    };
    const build: Build = { number: 1, url: "1", building: false, timestamp: 1234567890 };

    const jenkinsMock = {
      getItem: vi.fn(async () => item),
      getBuild: vi.fn(async () => build)
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(getBuild(runtime, "job1")).resolves.toEqual({
      number: 1,
      url: "1",
      building: false,
      timestamp: 1234567890
    });

    expect(jenkinsMock.getBuild).toHaveBeenCalledWith("job1", 1);
  });

  it("getBuildScripts defaults to last build number", async () => {
    const item: Job = {
      kind: "Job",
      class_: "Job",
      color: "blue",
      fullname: "job1",
      name: "job1",
      url: "1",
      lastBuild: { number: 1, url: "1" }
    };

    const jenkinsMock = {
      getItem: vi.fn(async () => item),
      getBuildReplay: vi.fn(async () => ({ scripts: ["script1", "script2"] }))
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(getBuildScripts(runtime, "job1")).resolves.toEqual(["script1", "script2"]);
  });

  it("getBuildConsoleOutput defaults to last build number", async () => {
    const item: Job = {
      kind: "Job",
      class_: "Job",
      color: "blue",
      fullname: "job1",
      name: "job1",
      url: "1",
      lastBuild: { number: 1, url: "1" }
    };

    const jenkinsMock = {
      getItem: vi.fn(async () => item),
      getBuildConsoleOutput: vi.fn(async () => "Console output here")
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(getBuildConsoleOutput(runtime, "job1")).resolves.toBe("Console output here");
  });

  it("getBuildConsoleChunk defaults to last build number", async () => {
    const item: Job = {
      kind: "Job",
      class_: "Job",
      color: "blue",
      fullname: "job1",
      name: "job1",
      url: "1",
      lastBuild: { number: 1, url: "1" }
    };

    const jenkinsMock = {
      getItem: vi.fn(async () => item),
      getBuildConsoleChunk: vi.fn(async () => ({
        start: 120,
        nextStart: 180,
        hasMore: true,
        completed: false,
        text: "new chunk"
      }))
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(getBuildConsoleChunk(runtime, "job1", 120)).resolves.toEqual({
      start: 120,
      nextStart: 180,
      hasMore: true,
      completed: false,
      text: "new chunk"
    });

    expect(jenkinsMock.getBuildConsoleChunk).toHaveBeenCalledWith("job1", 1, 120);
  });

  it("getBuildConsoleTail defaults to last build number", async () => {
    const item: Job = {
      kind: "Job",
      class_: "Job",
      color: "blue",
      fullname: "job1",
      name: "job1",
      url: "1",
      lastBuild: { number: 1, url: "1" }
    };

    const jenkinsMock = {
      getItem: vi.fn(async () => item),
      getBuildConsoleTail: vi.fn(async () => ({
        start: 16,
        nextStart: 32,
        totalBytes: 32,
        truncated: true,
        text: "tail"
      }))
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(getBuildConsoleTail(runtime, "job1", undefined, 16)).resolves.toEqual({
      start: 16,
      nextStart: 32,
      totalBytes: 32,
      truncated: true,
      text: "tail"
    });

    expect(jenkinsMock.getBuildConsoleTail).toHaveBeenCalledWith("job1", 1, 16);
  });

  it("getBuildTestReport defaults to last build number", async () => {
    const item: Job = {
      kind: "Job",
      class_: "Job",
      color: "blue",
      fullname: "job1",
      name: "job1",
      url: "1",
      lastBuild: { number: 1, url: "1" }
    };

    const jenkinsMock = {
      getItem: vi.fn(async () => item),
      getBuildTestReport: vi.fn(async () => ({ reports: ["report1", "report2"] }))
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(getBuildTestReport(runtime, "job1")).resolves.toEqual({
      reports: ["report1", "report2"]
    });
  });

  it("searchBuildConsole searches the tail window", async () => {
    const item: Job = {
      kind: "Job",
      class_: "Job",
      color: "blue",
      fullname: "job1",
      name: "job1",
      url: "1",
      lastBuild: { number: 1, url: "1" }
    };

    const jenkinsMock = {
      getItem: vi.fn(async () => item),
      getBuildConsoleTail: vi.fn(async () => ({
        start: 100,
        nextStart: 176,
        totalBytes: 176,
        truncated: true,
        text: ["compile", "ERROR: boom", "stack"].join("\n")
      }))
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(searchBuildConsole(runtime, "job1", "error")).resolves.toEqual({
      query: "error",
      caseSensitive: false,
      scannedStart: 100,
      scannedEnd: 176,
      totalBytes: 176,
      truncated: true,
      matches: [
        {
          line: 2,
          start: 100,
          end: 125,
          matchedLine: "ERROR: boom",
          excerpt: ["compile", "ERROR: boom", "stack"].join("\n")
        }
      ]
    });

    expect(jenkinsMock.getBuildConsoleTail).toHaveBeenCalledWith("job1", 1, 256 * 1024);
  });

  it("stopBuild", async () => {
    const jenkinsMock = {
      stopBuild: vi.fn(async () => undefined)
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await stopBuild(runtime, "job1", 1);

    expect(jenkinsMock.stopBuild).toHaveBeenCalledWith("job1", 1);
  });
});
