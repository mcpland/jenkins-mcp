import { describe, expect, it } from "vitest";

import {
  extractJenkinsAuthFromHeaders,
  JenkinsRuntime,
  loadLifespanContextFromEnv
} from "../../src/mcp-server/context.js";

describe("mcp-server context", () => {
  it("loads lifespan context from env", () => {
    const context = loadLifespanContextFromEnv({
      jenkins_url: undefined,
      jenkins_username: "username",
      jenkins_password: undefined,
      jenkins_timeout: "5",
      jenkins_verify_ssl: "true",
      jenkins_session_singleton: "true"
    });

    expect(context.jenkinsUrl).toBeUndefined();
    expect(context.jenkinsUsername).toBe("username");
    expect(context.jenkinsPassword).toBeUndefined();
    expect(context.jenkinsTimeout).toBe(5);
    expect(context.jenkinsVerifySsl).toBe(true);
    expect(context.jenkinsSessionSingleton).toBe(true);
  });

  it("extracts auth headers", () => {
    const auth = extractJenkinsAuthFromHeaders({
      "x-jenkins-url": "https://jenkins.example.com",
      "x-jenkins-username": "username",
      "x-jenkins-password": "password"
    });

    expect(auth).toEqual({
      jenkinsUrl: "https://jenkins.example.com",
      jenkinsUsername: "username",
      jenkinsPassword: "password"
    });
  });

  it("creates jenkins from lifespan context", async () => {
    const runtime = new JenkinsRuntime({
      jenkinsUrl: "https://jenkins.example.com",
      jenkinsUsername: "username",
      jenkinsPassword: "password",
      jenkinsTimeout: 5,
      jenkinsVerifySsl: true,
      jenkinsSessionSingleton: false
    });

    const jenkins = await runtime.getJenkins();

    expect(jenkins.url).toBe("https://jenkins.example.com");
    expect(jenkins.timeout).toBe(5);
    expect(jenkins.verifySsl).toBe(true);
  });

  it("creates jenkins from request header auth", async () => {
    const runtime = new JenkinsRuntime(
      {
        jenkinsUrl: "https://jenkins.example.com",
        jenkinsUsername: "username",
        jenkinsPassword: "password",
        jenkinsTimeout: 5,
        jenkinsVerifySsl: true,
        jenkinsSessionSingleton: false
      },
      {
        jenkinsUrl: "https://jenkins.fromrequest.com",
        jenkinsUsername: "state-username",
        jenkinsPassword: "state-password"
      }
    );

    const jenkins = await runtime.getJenkins();

    expect(jenkins.url).toBe("https://jenkins.fromrequest.com");
  });

  it("throws if auth is missing", async () => {
    const runtime = new JenkinsRuntime({
      jenkinsUrl: "https://jenkins.example.com",
      jenkinsUsername: undefined,
      jenkinsPassword: "password",
      jenkinsTimeout: 5,
      jenkinsVerifySsl: true,
      jenkinsSessionSingleton: false
    });

    await expect(runtime.getJenkins()).rejects.toThrow(
      "Jenkins authentication details are missing"
    );
  });

  it("reuses client when session singleton is enabled", async () => {
    const runtime = new JenkinsRuntime({
      jenkinsUrl: "https://jenkins.example.com",
      jenkinsUsername: "username",
      jenkinsPassword: "password",
      jenkinsTimeout: 5,
      jenkinsVerifySsl: true,
      jenkinsSessionSingleton: true
    });

    const client1 = await runtime.getJenkins();
    const client2 = await runtime.getJenkins();

    expect(client1).toBe(client2);
  });
});
