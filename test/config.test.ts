import { describe, expect, it } from "vitest";

import { loadConfigFromEnv } from "../src/config.js";

describe("loadConfigFromEnv", () => {
  it("loads a valid minimum configuration", () => {
    const config = loadConfigFromEnv({
      JENKINS_BASE_URL: "https://jenkins.example.com"
    });

    expect(config.baseUrl.toString()).toBe("https://jenkins.example.com/");
    expect(config.timeoutMs).toBe(10_000);
  });

  it("loads optional auth and timeout", () => {
    const config = loadConfigFromEnv({
      JENKINS_BASE_URL: "https://jenkins.example.com/root",
      JENKINS_USERNAME: "ci-user",
      JENKINS_API_TOKEN: "secret",
      JENKINS_TIMEOUT_MS: "3000"
    });

    expect(config.baseUrl.toString()).toBe("https://jenkins.example.com/root/");
    expect(config.username).toBe("ci-user");
    expect(config.apiToken).toBe("secret");
    expect(config.timeoutMs).toBe(3000);
  });

  it("throws when base url is missing", () => {
    expect(() => loadConfigFromEnv({})).toThrow("JENKINS_BASE_URL is required");
  });

  it("throws when auth is only partially configured", () => {
    expect(() =>
      loadConfigFromEnv({
        JENKINS_BASE_URL: "https://jenkins.example.com",
        JENKINS_USERNAME: "ci-user"
      })
    ).toThrow("Set both JENKINS_USERNAME and JENKINS_API_TOKEN");
  });

  it("throws on invalid timeout", () => {
    expect(() =>
      loadConfigFromEnv({
        JENKINS_BASE_URL: "https://jenkins.example.com",
        JENKINS_TIMEOUT_MS: "-1"
      })
    ).toThrow("JENKINS_TIMEOUT_MS must be a positive integer");
  });
});
