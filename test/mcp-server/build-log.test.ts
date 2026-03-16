import { describe, expect, it } from "vitest";

import { collectFailureExcerpts, searchBuildConsoleText } from "../../src/mcp-server/build-log.js";

describe("searchBuildConsoleText", () => {
  it("returns excerpt windows with byte offsets", () => {
    expect(
      searchBuildConsoleText({
        text: ["[Pipeline] stage", "compile ok", "ERROR: boom happened", "stack line", "tail"].join(
          "\n"
        ),
        baseOffset: 100,
        query: "error",
        contextLines: 1
      })
    ).toEqual([
      {
        line: 3,
        start: 117,
        end: 160,
        matchedLine: "ERROR: boom happened",
        excerpt: ["compile ok", "ERROR: boom happened", "stack line"].join("\n")
      }
    ]);
  });

  it("deduplicates overlapping match windows", () => {
    expect(
      searchBuildConsoleText({
        text: ["first", "ERROR: one", "ERROR: two", "last"].join("\n"),
        query: "ERROR",
        contextLines: 1,
        maxMatches: 5,
        caseSensitive: true
      })
    ).toHaveLength(1);
  });

  it("falls back to a trailing excerpt when no failure anchor is found", () => {
    expect(
      collectFailureExcerpts({
        text: ["first", "second", "third"].join("\n"),
        baseOffset: 50,
        maxExcerpts: 1
      })
    ).toEqual([
      {
        source: "tail",
        label: "recent tail",
        line: 3,
        start: 50,
        end: 68,
        matchedLine: "third",
        excerpt: ["first", "second", "third"].join("\n")
      }
    ]);
  });
});
