import type { Build } from "../jenkins/model/build.js";
import type { ItemType } from "../jenkins/model/item.js";
import { type Jenkins, JenkinsHttpError } from "../jenkins/rest-client.js";
import type { ToolRuntime } from "./runtime.js";
import { DEFAULT_FAILURE_QUERIES, ProgressiveConsoleExcerptCollector } from "./build-log.js";
import { buildToOutput, removeNil } from "./serializers.js";

const MAX_BUILD_CONSOLE_CHUNK_BYTES = 64 * 1024;
const DEFAULT_BUILD_CONSOLE_CHUNK_BYTES = 16 * 1024;
const MAX_BUILD_CONSOLE_TAIL_BYTES = 64 * 1024;
const DEFAULT_BUILD_CONSOLE_TAIL_BYTES = 64 * 1024;
const MAX_SEARCH_BUILD_CONSOLE_BYTES = 128 * 1024;
const DEFAULT_SEARCH_BUILD_CONSOLE_BYTES = 128 * 1024;
const MAX_SEARCH_CONTEXT_LINES = 20;
const MAX_SEARCH_MATCHES = 8;
const MAX_FAILURE_EXCERPTS = 4;
const MAX_FAILURE_EXCERPT_BYTES = 128 * 1024;
const DEFAULT_FAILURE_EXCERPT_BYTES = 128 * 1024;
const MAX_TEST_FAILURE_TEXT_CHARS = 2048;
const TRUNCATION_MARKER = "[...truncated...]";

interface ScanBuildConsoleExcerptsOptions {
  chunkBytes: number;
  contextLines: number;
  maxMatches: number;
  queries: Array<{ label: string; query: string; caseSensitive?: boolean }>;
  stopWhenEnough: boolean;
  prioritizeByQuery?: boolean;
}

interface ScanBuildConsoleExcerptsResult {
  matches: Array<Record<string, unknown>>;
  trailingExcerpt: Record<string, unknown> | null;
  scannedEnd: number;
  truncated: boolean;
}

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

function truncateTextValue(
  value: string | undefined,
  maxChars = MAX_TEST_FAILURE_TEXT_CHARS
): string | undefined {
  if (value === undefined || value.length <= maxChars) {
    return value;
  }

  const markerBudget = TRUNCATION_MARKER.length * 2;
  const contextBudget = Math.max(maxChars - markerBudget, 64);
  const headChars = Math.ceil(contextBudget / 2);
  const tailChars = Math.floor(contextBudget / 2);

  return `${value.slice(0, headChars)}${TRUNCATION_MARKER}${value.slice(-tailChars)}`;
}

function runningBuildToOutput(build: Build): Record<string, unknown> {
  return removeNil({
    number: build.number,
    url: build.url,
    building: build.building,
    timestamp: build.timestamp
  }) as Record<string, unknown>;
}

async function resolveTargetBuildNumber(
  jenkins: Jenkins,
  fullname: string,
  number?: number
): Promise<number> {
  if (number !== undefined) {
    return number;
  }

  const item = await jenkins.getItem(fullname, 1);
  return resolveLastBuildNumber(item);
}

async function scanBuildConsoleExcerpts(
  jenkins: Jenkins,
  fullname: string,
  number: number,
  options: ScanBuildConsoleExcerptsOptions
): Promise<ScanBuildConsoleExcerptsResult> {
  const collector = new ProgressiveConsoleExcerptCollector({
    queries: options.queries,
    contextLines: options.contextLines,
    maxMatches: options.maxMatches,
    ...(options.prioritizeByQuery === undefined
      ? {}
      : { prioritizeByQuery: options.prioritizeByQuery })
  });

  let start = 0;
  let scannedEnd = 0;
  let truncated: boolean;

  while (true) {
    const chunk = await jenkins.getBuildConsoleChunk(fullname, number, start, options.chunkBytes);
    collector.appendChunk(chunk.text, chunk.start);
    scannedEnd = Math.max(scannedEnd, chunk.nextStart);

    if (options.stopWhenEnough && collector.canStop()) {
      truncated = chunk.hasMore;
      break;
    }

    if (!chunk.hasMore) {
      truncated = false;
      break;
    }

    if (chunk.nextStart <= start) {
      truncated = true;
      break;
    }

    start = chunk.nextStart;
  }

  const result = collector.finish();
  return {
    matches: result.matches.map((match) => ({ ...match })) as Array<Record<string, unknown>>,
    trailingExcerpt: result.trailingExcerpt ? { ...result.trailingExcerpt } : null,
    scannedEnd,
    truncated
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
          errorDetails: truncateTextValue(
            typeof testCase.errorDetails === "string" ? testCase.errorDetails : undefined
          ),
          errorStackTrace: truncateTextValue(
            typeof testCase.errorStackTrace === "string" ? testCase.errorStackTrace : undefined
          )
        }) as Record<string, unknown>
      );

      if (failures.length >= limit) {
        return failures;
      }
    }
  }

  return failures;
}

function toFailureSearchQueries(
  failingTests: Record<string, unknown>[]
): Array<{ label: string; query: string; caseSensitive?: boolean }> {
  const queries = new Set<string>();

  for (const failingTest of failingTests) {
    const className = typeof failingTest.className === "string" ? failingTest.className : undefined;
    const testName = typeof failingTest.name === "string" ? failingTest.name : undefined;

    if (className) {
      queries.add(className);
    }

    if (testName) {
      queries.add(testName);
    }
  }

  for (const query of DEFAULT_FAILURE_QUERIES) {
    queries.add(query);
  }

  return [...queries].map((query) => ({ label: query, query }));
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
  const targetNumber = await resolveTargetBuildNumber(jenkins, fullname, number);
  const build = await jenkins.getBuild(fullname, targetNumber);
  return buildToOutput(build);
}

export async function getBuildScripts(
  runtime: ToolRuntime,
  fullname: string,
  number?: number
): Promise<string[]> {
  const jenkins = await runtime.getJenkins();
  const targetNumber = await resolveTargetBuildNumber(jenkins, fullname, number);
  const replay = await jenkins.getBuildReplay(fullname, targetNumber);
  return replay.scripts;
}

export async function getBuildConsoleOutput(
  runtime: ToolRuntime,
  fullname: string,
  number?: number
): Promise<string> {
  const jenkins = await runtime.getJenkins();
  const targetNumber = await resolveTargetBuildNumber(jenkins, fullname, number);
  return jenkins.getBuildConsoleOutput(fullname, targetNumber);
}

export async function getBuildConsoleChunk(
  runtime: ToolRuntime,
  fullname: string,
  start: number,
  number?: number,
  maxBytes?: number
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();
  const targetNumber = await resolveTargetBuildNumber(jenkins, fullname, number);

  return removeNil(
    await jenkins.getBuildConsoleChunk(
      fullname,
      targetNumber,
      start,
      clampPositiveInt(maxBytes, DEFAULT_BUILD_CONSOLE_CHUNK_BYTES, MAX_BUILD_CONSOLE_CHUNK_BYTES)
    )
  ) as Record<string, unknown>;
}

export async function getBuildConsoleTail(
  runtime: ToolRuntime,
  fullname: string,
  number?: number,
  maxBytes?: number
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();
  const targetNumber = await resolveTargetBuildNumber(jenkins, fullname, number);

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
  const targetNumber = await resolveTargetBuildNumber(jenkins, fullname, number);
  const scan = await scanBuildConsoleExcerpts(jenkins, fullname, targetNumber, {
    chunkBytes: clampPositiveInt(
      maxBytes,
      DEFAULT_SEARCH_BUILD_CONSOLE_BYTES,
      MAX_SEARCH_BUILD_CONSOLE_BYTES
    ),
    contextLines: clampNonNegativeInt(contextLines, 8, MAX_SEARCH_CONTEXT_LINES),
    maxMatches: clampPositiveInt(maxMatches, 5, MAX_SEARCH_MATCHES),
    queries: [{ label: query, query, caseSensitive }],
    stopWhenEnough: true
  });

  return {
    query,
    caseSensitive,
    scannedStart: 0,
    scannedEnd: scan.scannedEnd,
    totalBytes: scan.scannedEnd,
    truncated: scan.truncated,
    matches: scan.matches.map(({ label: _label, source: _source, ...match }) => match)
  };
}

export async function getBuildFailureExcerpt(
  runtime: ToolRuntime,
  fullname: string,
  number?: number,
  maxBytes?: number,
  maxExcerpts?: number
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();
  const targetNumber = await resolveTargetBuildNumber(jenkins, fullname, number);
  const normalizedMaxExcerpts = clampPositiveInt(maxExcerpts, 3, MAX_FAILURE_EXCERPTS);
  const normalizedChunkBytes = clampPositiveInt(
    maxBytes,
    DEFAULT_FAILURE_EXCERPT_BYTES,
    MAX_FAILURE_EXCERPT_BYTES
  );

  const build = await jenkins.getBuild(fullname, targetNumber);

  let failingTests: Record<string, unknown>[] = [];
  try {
    const report = await jenkins.getBuildTestReport(fullname, targetNumber);
    failingTests = extractFailingTests(report, Math.max(normalizedMaxExcerpts * 2, 6));
  } catch (error) {
    if (!(error instanceof JenkinsHttpError && error.status === 404)) {
      throw error;
    }
  }

  const scan = await scanBuildConsoleExcerpts(jenkins, fullname, targetNumber, {
    chunkBytes: normalizedChunkBytes,
    contextLines: 12,
    maxMatches: normalizedMaxExcerpts,
    queries: toFailureSearchQueries(failingTests),
    stopWhenEnough: false,
    prioritizeByQuery: true
  });

  const excerpts =
    scan.matches.length > 0
      ? scan.matches
      : scan.trailingExcerpt
        ? [
            {
              source: "tail",
              label: "recent tail",
              ...scan.trailingExcerpt
            }
          ]
        : [];

  return {
    build: buildToOutput(build),
    scan: removeNil({
      start: 0,
      nextStart: scan.scannedEnd,
      totalBytes: scan.scannedEnd,
      truncated: scan.truncated
    }) as Record<string, unknown>,
    failingTests,
    excerpts
  };
}

export async function getBuildTestReport(
  runtime: ToolRuntime,
  fullname: string,
  number?: number
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();
  const targetNumber = await resolveTargetBuildNumber(jenkins, fullname, number);
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
