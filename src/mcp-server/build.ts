import type { Build } from "../jenkins/model/build.js";
import type { ItemType } from "../jenkins/model/item.js";
import { JenkinsHttpError } from "../jenkins/rest-client.js";
import type { ToolRuntime } from "./runtime.js";
import { collectFailureExcerpts, searchBuildConsoleText } from "./build-log.js";
import { buildToOutput, removeNil } from "./serializers.js";

function resolveLastBuildNumber(item: ItemType): number {
  if (
    (item.kind === "Job" ||
      item.kind === "FreeStyleProject" ||
      item.kind === "MultiBranchProject") &&
    item.lastBuild?.number
  ) {
    return item.lastBuild.number;
  }

  throw new Error("Last build number is unavailable for this item.");
}

function runningBuildToOutput(build: Build): Record<string, unknown> {
  return removeNil({
    number: build.number,
    url: build.url,
    building: build.building,
    timestamp: build.timestamp
  }) as Record<string, unknown>;
}

export async function getRunningBuilds(
  runtime: ToolRuntime
): Promise<Array<Record<string, unknown>>> {
  const jenkins = await runtime.getJenkins();
  const builds = await jenkins.getRunningBuilds();
  return builds.map(runningBuildToOutput);
}

export async function getBuild(
  runtime: ToolRuntime,
  fullname: string,
  number?: number
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();

  let targetNumber = number;
  if (targetNumber === undefined) {
    const item = await jenkins.getItem(fullname, 1);
    targetNumber = resolveLastBuildNumber(item);
  }

  const build = await jenkins.getBuild(fullname, targetNumber);
  return buildToOutput(build);
}

export async function getBuildScripts(
  runtime: ToolRuntime,
  fullname: string,
  number?: number
): Promise<string[]> {
  const jenkins = await runtime.getJenkins();

  let targetNumber = number;
  if (targetNumber === undefined) {
    const item = await jenkins.getItem(fullname, 1);
    targetNumber = resolveLastBuildNumber(item);
  }

  const replay = await jenkins.getBuildReplay(fullname, targetNumber);
  return replay.scripts;
}

export async function getBuildConsoleOutput(
  runtime: ToolRuntime,
  fullname: string,
  number?: number
): Promise<string> {
  const jenkins = await runtime.getJenkins();

  let targetNumber = number;
  if (targetNumber === undefined) {
    const item = await jenkins.getItem(fullname, 1);
    targetNumber = resolveLastBuildNumber(item);
  }

  return jenkins.getBuildConsoleOutput(fullname, targetNumber);
}

export async function getBuildConsoleChunk(
  runtime: ToolRuntime,
  fullname: string,
  start: number,
  number?: number
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();

  let targetNumber = number;
  if (targetNumber === undefined) {
    const item = await jenkins.getItem(fullname, 1);
    targetNumber = resolveLastBuildNumber(item);
  }

  return removeNil(await jenkins.getBuildConsoleChunk(fullname, targetNumber, start)) as Record<
    string,
    unknown
  >;
}

export async function getBuildConsoleTail(
  runtime: ToolRuntime,
  fullname: string,
  number?: number,
  maxBytes = 64 * 1024
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();

  let targetNumber = number;
  if (targetNumber === undefined) {
    const item = await jenkins.getItem(fullname, 1);
    targetNumber = resolveLastBuildNumber(item);
  }

  return removeNil(await jenkins.getBuildConsoleTail(fullname, targetNumber, maxBytes)) as Record<
    string,
    unknown
  >;
}

export async function searchBuildConsole(
  runtime: ToolRuntime,
  fullname: string,
  query: string,
  number?: number,
  maxBytes = 256 * 1024,
  contextLines = 8,
  maxMatches = 5,
  caseSensitive = false
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();

  let targetNumber = number;
  if (targetNumber === undefined) {
    const item = await jenkins.getItem(fullname, 1);
    targetNumber = resolveLastBuildNumber(item);
  }

  const tail = await jenkins.getBuildConsoleTail(fullname, targetNumber, maxBytes);
  return {
    query,
    caseSensitive,
    scannedStart: tail.start,
    scannedEnd: tail.nextStart,
    totalBytes: tail.totalBytes,
    truncated: tail.truncated,
    matches: searchBuildConsoleText({
      text: tail.text,
      baseOffset: tail.start,
      query,
      contextLines,
      maxMatches,
      caseSensitive
    })
  };
}

function extractFailingTests(
  report: Record<string, unknown>,
  limit: number
): Record<string, unknown>[] {
  const suites = Array.isArray(report.suites) ? report.suites : [];
  const failures: Record<string, unknown>[] = [];

  for (const suiteValue of suites) {
    if (!(suiteValue && typeof suiteValue === "object")) {
      continue;
    }

    const suite = suiteValue as Record<string, unknown>;
    const suiteName = typeof suite.name === "string" ? suite.name : undefined;
    const cases = Array.isArray(suite.cases) ? suite.cases : [];

    for (const caseValue of cases) {
      if (!(caseValue && typeof caseValue === "object")) {
        continue;
      }

      const testCase = caseValue as Record<string, unknown>;
      const status = typeof testCase.status === "string" ? testCase.status : undefined;
      const hasErrorDetails =
        typeof testCase.errorDetails === "string" || typeof testCase.errorStackTrace === "string";
      const isFailure =
        hasErrorDetails || (status !== undefined && !["PASSED", "SKIPPED"].includes(status));

      if (!isFailure) {
        continue;
      }

      failures.push(
        removeNil({
          suite: suiteName,
          name: typeof testCase.name === "string" ? testCase.name : undefined,
          className: typeof testCase.className === "string" ? testCase.className : undefined,
          status,
          errorDetails:
            typeof testCase.errorDetails === "string" ? testCase.errorDetails : undefined,
          errorStackTrace:
            typeof testCase.errorStackTrace === "string" ? testCase.errorStackTrace : undefined
        }) as Record<string, unknown>
      );

      if (failures.length >= limit) {
        return failures;
      }
    }
  }

  return failures;
}

export async function getBuildFailureExcerpt(
  runtime: ToolRuntime,
  fullname: string,
  number?: number,
  maxBytes = 128 * 1024,
  maxExcerpts = 3
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();

  let targetNumber = number;
  if (targetNumber === undefined) {
    const item = await jenkins.getItem(fullname, 1);
    targetNumber = resolveLastBuildNumber(item);
  }

  const [build, tail] = await Promise.all([
    jenkins.getBuild(fullname, targetNumber),
    jenkins.getBuildConsoleTail(fullname, targetNumber, maxBytes)
  ]);

  let failingTests: Record<string, unknown>[] = [];
  try {
    const report = await jenkins.getBuildTestReport(fullname, targetNumber);
    failingTests = extractFailingTests(report, Math.max(maxExcerpts * 2, 6));
  } catch (error) {
    if (!(error instanceof JenkinsHttpError && error.status === 404)) {
      throw error;
    }
  }

  return {
    build: buildToOutput(build),
    tail: removeNil({
      start: tail.start,
      nextStart: tail.nextStart,
      totalBytes: tail.totalBytes,
      truncated: tail.truncated
    }) as Record<string, unknown>,
    failingTests,
    excerpts: collectFailureExcerpts({
      text: tail.text,
      baseOffset: tail.start,
      maxExcerpts
    })
  };
}

export async function getBuildTestReport(
  runtime: ToolRuntime,
  fullname: string,
  number?: number
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();

  let targetNumber = number;
  if (targetNumber === undefined) {
    const item = await jenkins.getItem(fullname, 1);
    targetNumber = resolveLastBuildNumber(item);
  }

  return jenkins.getBuildTestReport(fullname, targetNumber);
}

export async function stopBuild(
  runtime: ToolRuntime,
  fullname: string,
  number: number
): Promise<void> {
  const jenkins = await runtime.getJenkins();
  await jenkins.stopBuild(fullname, number);
}
