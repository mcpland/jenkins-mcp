import type { BuildConsoleExcerpt, BuildConsoleSearchMatch } from "../jenkins/model/build.js";

interface ConsoleLine {
  line: number;
  start: number;
  end: number;
  text: string;
}

export interface SearchBuildConsoleTextOptions {
  text: string;
  baseOffset?: number;
  query: string;
  contextLines?: number;
  maxMatches?: number;
  caseSensitive?: boolean;
}

export interface CollectFailureExcerptsOptions {
  text: string;
  baseOffset?: number;
  maxExcerpts?: number;
  contextLines?: number;
  queries?: string[];
}

const DEFAULT_FAILURE_QUERIES = [
  "Caused by:",
  "script returned exit code",
  "BUILD FAILURE",
  "AbortException",
  "npm ERR!",
  "Exception",
  "ERROR",
  "FAILED"
];

function splitConsoleLines(text: string, baseOffset: number): ConsoleLine[] {
  const lines: ConsoleLine[] = [];
  let cursor = 0;
  let offset = baseOffset;
  let line = 1;

  while (cursor < text.length) {
    const newlineIndex = text.indexOf("\n", cursor);
    const nextCursor = newlineIndex === -1 ? text.length : newlineIndex + 1;
    const rawSegment = text.slice(cursor, nextCursor);
    const normalizedText = rawSegment.endsWith("\r\n")
      ? rawSegment.slice(0, -2)
      : rawSegment.endsWith("\n")
        ? rawSegment.slice(0, -1)
        : rawSegment;
    const segmentBytes = Buffer.byteLength(rawSegment);

    lines.push({
      line,
      start: offset,
      end: offset + segmentBytes,
      text: normalizedText
    });

    offset += segmentBytes;
    cursor = nextCursor;
    line += 1;
  }

  if (text.length === 0) {
    return [];
  }

  return lines;
}

function lineIncludesQuery(line: string, query: string, caseSensitive: boolean): boolean {
  if (caseSensitive) {
    return line.includes(query);
  }

  return line.toLowerCase().includes(query.toLowerCase());
}

export function searchBuildConsoleText(
  options: SearchBuildConsoleTextOptions
): BuildConsoleSearchMatch[] {
  const {
    text,
    baseOffset = 0,
    query,
    contextLines = 8,
    maxMatches = 5,
    caseSensitive = false
  } = options;
  const lines = splitConsoleLines(text, baseOffset);
  const matches: BuildConsoleSearchMatch[] = [];
  let lastCoveredLineIndex = -1;

  for (const [index, line] of lines.entries()) {
    if (!lineIncludesQuery(line.text, query, caseSensitive)) {
      continue;
    }

    const startIndex = Math.max(0, index - contextLines);
    const endIndex = Math.min(lines.length - 1, index + contextLines);
    if (startIndex <= lastCoveredLineIndex) {
      continue;
    }

    const excerptLines = lines.slice(startIndex, endIndex + 1);
    const firstLine = excerptLines[0];
    const lastLine = excerptLines.at(-1);
    if (!(firstLine && lastLine)) {
      continue;
    }

    matches.push({
      line: line.line,
      start: firstLine.start,
      end: lastLine.end,
      matchedLine: line.text,
      excerpt: excerptLines.map((excerptLine) => excerptLine.text).join("\n")
    });

    lastCoveredLineIndex = endIndex;
    if (matches.length >= maxMatches) {
      break;
    }
  }

  return matches;
}

export function getTrailingConsoleExcerpt(
  text: string,
  baseOffset = 0,
  lineCount = 40
): BuildConsoleSearchMatch | null {
  const lines = splitConsoleLines(text, baseOffset);
  if (lines.length === 0) {
    return null;
  }

  const startIndex = Math.max(0, lines.length - lineCount);
  const excerptLines = lines.slice(startIndex);
  const firstLine = excerptLines[0];
  const lastLine = excerptLines.at(-1);
  if (!(firstLine && lastLine)) {
    return null;
  }

  return {
    line: lastLine.line,
    start: firstLine.start,
    end: lastLine.end,
    matchedLine: lastLine.text,
    excerpt: excerptLines.map((excerptLine) => excerptLine.text).join("\n")
  };
}

export function collectFailureExcerpts(
  options: CollectFailureExcerptsOptions
): BuildConsoleExcerpt[] {
  const {
    text,
    baseOffset = 0,
    maxExcerpts = 3,
    contextLines = 12,
    queries = DEFAULT_FAILURE_QUERIES
  } = options;
  const excerpts: BuildConsoleExcerpt[] = [];
  const seenRanges = new Set<string>();

  for (const query of queries) {
    const matches = searchBuildConsoleText({
      text,
      baseOffset,
      query,
      contextLines,
      maxMatches: maxExcerpts,
      caseSensitive: false
    });

    for (const match of matches) {
      const key = `${match.start}:${match.end}`;
      if (seenRanges.has(key)) {
        continue;
      }

      seenRanges.add(key);
      excerpts.push({
        source: "pattern",
        label: query,
        ...match
      });

      if (excerpts.length >= maxExcerpts) {
        return excerpts;
      }
    }
  }

  const trailingExcerpt =
    excerpts.length === 0 ? getTrailingConsoleExcerpt(text, baseOffset) : null;
  if (trailingExcerpt) {
    excerpts.push({
      source: "tail",
      label: "recent tail",
      ...trailingExcerpt
    });
  }

  return excerpts;
}
