import { describe, expect, it } from "vitest";

import { RestEndpoint } from "../../src/jenkins/rest-endpoint.js";

describe("RestEndpoint", () => {
  it("captures template fields", () => {
    expect(new RestEndpoint("api/json?depth={depth}").fields).toEqual(new Set(["depth"]));
    expect(new RestEndpoint("api/json").fields).toEqual(new Set());
  });

  it("formats endpoint values", () => {
    const endpoint = new RestEndpoint("api/json?depth={depth}");
    expect(endpoint.call({ depth: 0 })).toBe("api/json?depth=0");
  });

  it("throws when required fields are missing", () => {
    const endpoint = new RestEndpoint("api/json?depth={depth}");
    expect(() => endpoint.call({})).toThrow("Missing: {'depth'}");
  });
});
