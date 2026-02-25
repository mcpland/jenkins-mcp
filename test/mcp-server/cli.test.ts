import { describe, expect, it } from "vitest";

import { applyCliEnv, parseCliArgs } from "../../src/cli.js";

describe("cli parsing", () => {
  it("uses default values", () => {
    const options = parseCliArgs([]);

    expect(options.transport).toBe("stdio");
    expect(options.host).toBe("0.0.0.0");
    expect(options.port).toBe(9887);
    expect(options.jenkinsTimeout).toBe(5);
    expect(options.jenkinsVerifySsl).toBe(true);
    expect(options.jenkinsSessionSingleton).toBe(true);
    expect(options.readOnly).toBe(false);
  });

  it("parses explicit options", () => {
    const options = parseCliArgs([
      "--transport",
      "streamable-http",
      "--host",
      "127.0.0.1",
      "--port",
      "9888",
      "--jenkins-url",
      "https://jenkins.example.com",
      "--jenkins-username",
      "username",
      "--jenkins-password",
      "password",
      "--jenkins-timeout",
      "30",
      "--no-jenkins-verify-ssl",
      "--no-jenkins-session-singleton",
      "--read-only"
    ]);

    expect(options.transport).toBe("streamable-http");
    expect(options.host).toBe("127.0.0.1");
    expect(options.port).toBe(9888);
    expect(options.jenkinsUrl).toBe("https://jenkins.example.com");
    expect(options.jenkinsUsername).toBe("username");
    expect(options.jenkinsPassword).toBe("password");
    expect(options.jenkinsTimeout).toBe(30);
    expect(options.jenkinsVerifySsl).toBe(false);
    expect(options.jenkinsSessionSingleton).toBe(false);
    expect(options.readOnly).toBe(true);
  });

  it("applies cli environment", () => {
    const env: NodeJS.ProcessEnv = {};

    applyCliEnv(
      {
        transport: "stdio",
        host: "0.0.0.0",
        port: 9887,
        jenkinsTimeout: 30,
        jenkinsVerifySsl: false,
        jenkinsSessionSingleton: false,
        readOnly: false,
        toolRegex: "",
        jenkinsUrl: "https://jenkins.example.com",
        jenkinsUsername: "username",
        jenkinsPassword: "password"
      },
      env
    );

    expect(env.jenkins_url).toBe("https://jenkins.example.com");
    expect(env.jenkins_username).toBe("username");
    expect(env.jenkins_password).toBe("password");
    expect(env.jenkins_timeout).toBe("30");
    expect(env.jenkins_verify_ssl).toBe("false");
    expect(env.jenkins_session_singleton).toBe("false");
  });
});
