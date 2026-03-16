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

export interface ProgressiveConsoleExcerptQuery {
  label: string;
  query: string;
  caseSensitive?: boolean;
}

export interface ProgressiveConsoleExcerptCollectorOptions {
  queries: ProgressiveConsoleExcerptQuery[];
  contextLines?: number;
  maxMatches?: number;
  tailLineCount?: number;
  prioritizeByQuery?: boolean;
}

interface PendingMatch {
  excerptLines: ConsoleLine[];
  matchedLine: ConsoleLine;
  queryIndex: number;
  remainingAfter: number;
}

interface StoredMatch extends BuildConsoleExcerpt {
  queryIndex: number;
}

export const DEFAULT_FAILURE_QUERIES = [
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

function normalizeLineText(rawSegment: string): string {
  return rawSegment.endsWith("\r\n")
    ? rawSegment.slice(0, -2)
    : rawSegment.endsWith("\n")
      ? rawSegment.slice(0, -1)
      : rawSegment;
}

function buildSearchMatchFromLines(
  lines: ConsoleLine[],
  matchedLine: ConsoleLine
): BuildConsoleSearchMatch {
  const firstLine = lines[0];
  const lastLine = lines.at(-1);
  if (!(firstLine && lastLine)) {
    throw new Error("Cannot build console excerpt from empty lines.");
  }

  return {
    line: matchedLine.line,
    start: firstLine.start,
    end: lastLine.end,
    matchedLine: matchedLine.text,
    excerpt: lines.map((line) => line.text).join("\n")
  };
}

export class ProgressiveConsoleExcerptCollector {
  private carryText = "";
  private carryStartOffset = 0;
  private lineNumber = 1;
  private readonly contextLines: number;
  private readonly maxMatches: number;
  private readonly tailLineCount: number;
  private readonly prioritizeByQuery: boolean;
  private readonly queryLimit: number;
  private readonly queries: Array<Required<ProgressiveConsoleExcerptQuery>>;
  private readonly recentLines: ConsoleLine[] = [];
  private readonly tailLines: ConsoleLine[] = [];
  private readonly pendingMatches: PendingMatch[] = [];
  private readonly finalizedMatches: StoredMatch[] = [];
  private lastCoveredLine = 0;

  constructor(options: ProgressiveConsoleExcerptCollectorOptions) {
    this.contextLines = options.contextLines ?? 8;
    this.maxMatches = options.maxMatches ?? 5;
    this.tailLineCount = options.tailLineCount ?? 40;
    this.prioritizeByQuery = options.prioritizeByQuery ?? false;
    this.queryLimit = Math.max(
      this.maxMatches,
      this.maxMatches * Math.max(options.queries.length, 1)
    );
    this.queries = options.queries.map((query) => ({
      label: query.label,
      query: query.query,
      caseSensitive: query.caseSensitive ?? false
    }));
  }

  appendChunk(text: string, startOffset: number): void {
    if (text.length === 0) {
      if (this.carryText.length === 0) {
        this.carryStartOffset = startOffset;
      }
      return;
    }

    const combinedText = this.carryText + text;
    let cursor = 0;
    let lineStartOffset = this.carryText.length > 0 ? this.carryStartOffset : startOffset;

    while (cursor < combinedText.length) {
      const newlineIndex = combinedText.indexOf("\n", cursor);
      if (newlineIndex === -1) {
        break;
      }

      const nextCursor = newlineIndex + 1;
      const rawSegment = combinedText.slice(cursor, nextCursor);
      this.emitLine(rawSegment, lineStartOffset);
      lineStartOffset += Buffer.byteLength(rawSegment);
      cursor = nextCursor;
    }

    this.carryText = combinedText.slice(cursor);
    this.carryStartOffset = lineStartOffset;
  }

  canStop(): boolean {
    return this.pendingMatches.length === 0 && this.finalizedMatches.length >= this.maxMatches;
  }

  finish(): { matches: BuildConsoleExcerpt[]; trailingExcerpt: BuildConsoleSearchMatch | null } {
    if (this.carryText.length > 0) {
      this.emitLine(this.carryText, this.carryStartOffset);
      this.carryText = "";
    }

    while (this.pendingMatches.length > 0) {
      const pending = this.pendingMatches.shift();
      if (!pending) {
        break;
      }

      this.finalizePendingMatch(pending);
    }

    const matches = this.selectMatches();
    return {
      matches,
      trailingExcerpt: matches.length === 0 ? this.getTrailingExcerpt() : null
    };
  }

  private emitLine(rawSegment: string, startOffset: number): void {
    const segmentBytes = Buffer.byteLength(rawSegment);
    const line: ConsoleLine = {
      line: this.lineNumber,
      start: startOffset,
      end: startOffset + segmentBytes,
      text: normalizeLineText(rawSegment)
    };
    const previousLines = [...this.recentLines];

    for (const pending of this.pendingMatches) {
      pending.excerptLines.push(line);
      pending.remainingAfter -= 1;
    }

    while (this.pendingMatches.length > 0) {
      const nextPending = this.pendingMatches[0];
      if (!nextPending || nextPending.remainingAfter > 0) {
        break;
      }

      const pending = this.pendingMatches.shift();
      if (!pending) {
        break;
      }

      this.finalizePendingMatch(pending);
    }

    const coveredThroughLine = Math.max(
      this.lastCoveredLine,
      ...this.pendingMatches.map((pending) => pending.matchedLine.line + this.contextLines)
    );
    const matchStartLine = Math.max(1, line.line - this.contextLines);
    if (this.finalizedMatches.length < this.queryLimit && matchStartLine > coveredThroughLine) {
      const matchingQuery = this.queries.findIndex((query) =>
        lineIncludesQuery(line.text, query.query, query.caseSensitive)
      );

      if (matchingQuery !== -1) {
        this.pendingMatches.push({
          excerptLines: [...previousLines, line],
          matchedLine: line,
          queryIndex: matchingQuery,
          remainingAfter: this.contextLines
        });

        if (this.contextLines === 0) {
          const pending = this.pendingMatches.shift();
          if (pending) {
            this.finalizePendingMatch(pending);
          }
        }
      }
    }

    this.recentLines.push(line);
    while (this.recentLines.length > this.contextLines) {
      this.recentLines.shift();
    }

    this.tailLines.push(line);
    while (this.tailLines.length > this.tailLineCount) {
      this.tailLines.shift();
    }

    this.lineNumber += 1;
  }

  private finalizePendingMatch(pending: PendingMatch): void {
    const query = this.queries[pending.queryIndex];
    if (!query) {
      return;
    }

    const match = buildSearchMatchFromLines(pending.excerptLines, pending.matchedLine);
    this.finalizedMatches.push({
      source: "pattern",
      label: query.label,
      queryIndex: pending.queryIndex,
      ...match
    });
    this.lastCoveredLine = Math.max(this.lastCoveredLine, pending.excerptLines.at(-1)?.line ?? 0);
  }

  private getTrailingExcerpt(): BuildConsoleSearchMatch | null {
    if (this.tailLines.length === 0) {
      return null;
    }

    return buildSearchMatchFromLines(this.tailLines, this.tailLines.at(-1) as ConsoleLine);
  }

  private selectMatches(): BuildConsoleExcerpt[] {
    const matches = [...this.finalizedMatches];
    matches.sort((left, right) => {
      if (this.prioritizeByQuery && left.queryIndex !== right.queryIndex) {
        return left.queryIndex - right.queryIndex;
      }

      return left.start - right.start;
    });

    return matches.slice(0, this.maxMatches).map(({ queryIndex: _queryIndex, ...match }) => match);
  }
}
