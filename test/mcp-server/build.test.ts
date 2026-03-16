import { describe, expect, it, vi } from "vitest";

import type { Build } from "../../src/jenkins/model/build.js";
import type { Job } from "../../src/jenkins/model/item.js";
import type { Jenkins } from "../../src/jenkins/rest-client.js";
import {
  getBuild,
  getBuildConsoleChunk,
  getBuildFailureExcerpt,
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

    expect(jenkinsMock.getBuildConsoleChunk).toHaveBeenCalledWith("job1", 1, 120, 16 * 1024);
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

  it("clamps oversized console requests", async () => {
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
        start: 0,
        nextStart: 0,
        hasMore: false,
        completed: true,
        text: ""
      })),
      getBuild: vi.fn(async () => ({ number: 1, url: "1" })),
      getBuildTestReport: vi.fn(async () => ({ suites: [] }))
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await getBuildConsoleChunk(runtime, "job1", 0, undefined, 1024 * 1024);
    await searchBuildConsole(runtime, "job1", "error", undefined, 1024 * 1024, 999, 999);
    await getBuildFailureExcerpt(runtime, "job1", undefined, 1024 * 1024, 999);

    expect(jenkinsMock.getBuildConsoleChunk).toHaveBeenNthCalledWith(1, "job1", 1, 0, 64 * 1024);
    expect(jenkinsMock.getBuildConsoleChunk).toHaveBeenNthCalledWith(2, "job1", 1, 0, 128 * 1024);
    expect(jenkinsMock.getBuildConsoleChunk).toHaveBeenNthCalledWith(3, "job1", 1, 0, 128 * 1024);
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

  it("searchBuildConsole scans progressive chunks", async () => {
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
      getBuildConsoleChunk: vi
        .fn()
        .mockResolvedValueOnce({
          start: 0,
          nextStart: 8,
          hasMore: true,
          completed: false,
          text: "compile\n"
        })
        .mockResolvedValueOnce({
          start: 8,
          nextStart: 19,
          hasMore: false,
          completed: true,
          text: "ERROR\nstack"
        })
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(searchBuildConsole(runtime, "job1", "error")).resolves.toEqual({
      query: "error",
      caseSensitive: false,
      scannedStart: 0,
      scannedEnd: 19,
      totalBytes: 19,
      truncated: false,
      matches: [
        {
          line: 2,
          start: 0,
          end: 19,
          matchedLine: "ERROR",
          excerpt: ["compile", "ERROR", "stack"].join("\n")
        }
      ]
    });

    expect(jenkinsMock.getBuildConsoleChunk).toHaveBeenNthCalledWith(1, "job1", 1, 0, 128 * 1024);
    expect(jenkinsMock.getBuildConsoleChunk).toHaveBeenNthCalledWith(2, "job1", 1, 8, 128 * 1024);
  });

  it("getBuildFailureExcerpt combines build metadata, tests, and excerpts", async () => {
    const item: Job = {
      kind: "Job",
      class_: "Job",
      color: "blue",
      fullname: "job1",
      name: "job1",
      url: "1",
      lastBuild: { number: 1, url: "1" }
    };
    const build: Build = {
      number: 1,
      url: "1",
      building: false,
      result: "FAILURE",
      timestamp: 1234567890
    };

    const jenkinsMock = {
      getItem: vi.fn(async () => item),
      getBuild: vi.fn(async () => build),
      getBuildConsoleChunk: vi
        .fn()
        .mockResolvedValueOnce({
          start: 0,
          nextStart: 6,
          hasMore: true,
          completed: false,
          text: "build\n"
        })
        .mockResolvedValueOnce({
          start: 6,
          nextStart: 27,
          hasMore: false,
          completed: true,
          text: "Caused by: boom\nstack"
        }),
      getBuildTestReport: vi.fn(async () => ({
        suites: [
          {
            name: "Example Suite",
            cases: [
              {
                name: "test_case_1",
                className: "ExampleTest",
                status: "FAILED",
                errorDetails: "AssertionError"
              }
            ]
          }
        ]
      }))
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);

    await expect(getBuildFailureExcerpt(runtime, "job1")).resolves.toEqual({
      build: {
        number: 1,
        url: "1",
        building: false,
        result: "FAILURE",
        timestamp: 1234567890
      },
      scan: {
        start: 0,
        nextStart: 27,
        totalBytes: 27,
        truncated: false
      },
      failingTests: [
        {
          suite: "Example Suite",
          name: "test_case_1",
          className: "ExampleTest",
          status: "FAILED",
          errorDetails: "AssertionError"
        }
      ],
      excerpts: [
        {
          source: "pattern",
          label: "Caused by:",
          line: 2,
          start: 0,
          end: 27,
          matchedLine: "Caused by: boom",
          excerpt: ["build", "Caused by: boom", "stack"].join("\n")
        }
      ]
    });

    expect(jenkinsMock.getBuildConsoleChunk).toHaveBeenNthCalledWith(1, "job1", 1, 0, 128 * 1024);
    expect(jenkinsMock.getBuildConsoleChunk).toHaveBeenNthCalledWith(2, "job1", 1, 6, 128 * 1024);
  });

  it("truncates oversized failure details from the test report", async () => {
    const item: Job = {
      kind: "Job",
      class_: "Job",
      color: "blue",
      fullname: "job1",
      name: "job1",
      url: "1",
      lastBuild: { number: 1, url: "1" }
    };
    const hugeStack = `${"stack-line\n".repeat(400)}tail`;

    const jenkinsMock = {
      getItem: vi.fn(async () => item),
      getBuild: vi.fn(async () => ({
        number: 1,
        url: "1",
        result: "FAILURE"
      })),
      getBuildConsoleChunk: vi.fn(async () => ({
        start: 0,
        nextStart: 0,
        hasMore: false,
        completed: true,
        text: ""
      })),
      getBuildTestReport: vi.fn(async () => ({
        suites: [
          {
            name: "Example Suite",
            cases: [
              {
                name: "test_case_1",
                className: "ExampleTest",
                status: "FAILED",
                errorDetails: hugeStack,
                errorStackTrace: hugeStack
              }
            ]
          }
        ]
      }))
    } satisfies Partial<Jenkins>;

    const runtime = createRuntime(jenkinsMock);
    const result = await getBuildFailureExcerpt(runtime, "job1");
    const failingTest = (result.failingTests as Array<Record<string, unknown>>)[0];

    expect(failingTest?.errorDetails).toContain("[...truncated...]");
    expect(failingTest?.errorStackTrace).toContain("[...truncated...]");
    expect(String(failingTest?.errorDetails).length).toBeLessThanOrEqual(2048);
    expect(String(failingTest?.errorStackTrace).length).toBeLessThanOrEqual(2048);
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
