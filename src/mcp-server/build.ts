import type { Build } from "../jenkins/model/build.js";
import type { ItemType } from "../jenkins/model/item.js";
import { JenkinsHttpError } from "../jenkins/rest-client.js";
import type { ToolRuntime } from "./runtime.js";
import { collectFailureExcerpts, searchBuildConsoleText } from "./build-log.js";
import { buildToOutput, removeNil } from "./serializers.js";

const MAX_BUILD_CONSOLE_TAIL_BYTES = 64 * 1024;
const DEFAULT_BUILD_CONSOLE_TAIL_BYTES = 64 * 1024;
const MAX_SEARCH_BUILD_CONSOLE_BYTES = 128 * 1024;
const DEFAULT_SEARCH_BUILD_CONSOLE_BYTES = 128 * 1024;
const MAX_SEARCH_CONTEXT_LINES = 20;
const MAX_SEARCH_MATCHES = 8;
const MAX_FAILURE_EXCERPTS = 4;
const MAX_FAILURE_EXCERPT_BYTES = 128 * 1024;
const DEFAULT_FAILURE_EXCERPT_BYTES = 128 * 1024;

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

function clampPositiveInt(
  value: number | undefined,
  defaultValue: number,
  maxValue: number
): number {
  const normalized = value === undefined ? defaultValue : Math.trunc(value);
  return Math.max(1, Math.min(normalized, maxValue));
}

function clampNonNegativeInt(
  value: number | undefined,
  defaultValue: number,
  maxValue: number
): number {
  const normalized = value === undefined ? defaultValue : Math.trunc(value);
  return Math.max(0, Math.min(normalized, maxValue));
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
  maxBytes?: number
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();

  let targetNumber = number;
  if (targetNumber === undefined) {
    const item = await jenkins.getItem(fullname, 1);
    targetNumber = resolveLastBuildNumber(item);
  }

  return removeNil(
    await jenkins.getBuildConsoleTail(
      fullname,
      targetNumber,
      clampPositiveInt(maxBytes, DEFAULT_BUILD_CONSOLE_TAIL_BYTES, MAX_BUILD_CONSOLE_TAIL_BYTES)
    )
  ) as Record<string, unknown>;
}

export async function searchBuildConsole(
  runtime: ToolRuntime,
  fullname: string,
  query: string,
  number?: number,
  maxBytes?: number,
  contextLines?: number,
  maxMatches?: number,
  caseSensitive = false
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();

  let targetNumber = number;
  if (targetNumber === undefined) {
    const item = await jenkins.getItem(fullname, 1);
    targetNumber = resolveLastBuildNumber(item);
  }

  const tail = await jenkins.getBuildConsoleTail(
    fullname,
    targetNumber,
    clampPositiveInt(maxBytes, DEFAULT_SEARCH_BUILD_CONSOLE_BYTES, MAX_SEARCH_BUILD_CONSOLE_BYTES)
  );
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
      contextLines: clampNonNegativeInt(contextLines, 8, MAX_SEARCH_CONTEXT_LINES),
      maxMatches: clampPositiveInt(maxMatches, 5, MAX_SEARCH_MATCHES),
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
  maxBytes?: number,
  maxExcerpts?: number
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();

  let targetNumber = number;
  if (targetNumber === undefined) {
    const item = await jenkins.getItem(fullname, 1);
    targetNumber = resolveLastBuildNumber(item);
  }

  const [build, tail] = await Promise.all([
    jenkins.getBuild(fullname, targetNumber),
    jenkins.getBuildConsoleTail(
      fullname,
      targetNumber,
      clampPositiveInt(maxBytes, DEFAULT_FAILURE_EXCERPT_BYTES, MAX_FAILURE_EXCERPT_BYTES)
    )
  ]);

  let failingTests: Record<string, unknown>[] = [];
  try {
    const report = await jenkins.getBuildTestReport(fullname, targetNumber);
    const normalizedMaxExcerpts = clampPositiveInt(maxExcerpts, 3, MAX_FAILURE_EXCERPTS);
    failingTests = extractFailingTests(report, Math.max(normalizedMaxExcerpts * 2, 6));
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
      maxExcerpts: clampPositiveInt(maxExcerpts, 3, MAX_FAILURE_EXCERPTS)
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
