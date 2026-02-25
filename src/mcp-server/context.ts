import type { IncomingHttpHeaders } from "node:http";

import { Jenkins } from "../jenkins/rest-client.js";
import type { ToolRuntime } from "./runtime.js";

export interface LifespanContext {
  jenkinsUrl?: string | undefined;
  jenkinsUsername?: string | undefined;
  jenkinsPassword?: string | undefined;
  jenkinsTimeout: number;
  jenkinsVerifySsl: boolean;
  jenkinsSessionSingleton: boolean;
}

export interface JenkinsHeaderAuth {
  jenkinsUrl?: string | undefined;
  jenkinsUsername?: string | undefined;
  jenkinsPassword?: string | undefined;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === "true";
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function loadLifespanContextFromEnv(env: NodeJS.ProcessEnv = process.env): LifespanContext {
  return {
    jenkinsUrl: env.jenkins_url,
    jenkinsUsername: env.jenkins_username,
    jenkinsPassword: env.jenkins_password,
    jenkinsTimeout: Number.parseInt(env.jenkins_timeout ?? "5", 10),
    jenkinsVerifySsl: parseBoolean(env.jenkins_verify_ssl, true),
    jenkinsSessionSingleton: parseBoolean(env.jenkins_session_singleton, true)
  };
}

export function extractJenkinsAuthFromHeaders(headers: IncomingHttpHeaders): JenkinsHeaderAuth {
  return {
    jenkinsUrl: firstHeaderValue(headers["x-jenkins-url"]),
    jenkinsUsername: firstHeaderValue(headers["x-jenkins-username"]),
    jenkinsPassword: firstHeaderValue(headers["x-jenkins-password"])
  };
}

export class JenkinsRuntime implements ToolRuntime {
  private jenkinsClient: Jenkins | undefined;
  private headerAuth: JenkinsHeaderAuth | undefined;

  constructor(
    private readonly lifespanContext: LifespanContext,
    headerAuth?: JenkinsHeaderAuth
  ) {
    this.headerAuth = headerAuth;
  }

  setHeaderAuth(headerAuth: JenkinsHeaderAuth): void {
    this.headerAuth = headerAuth;
  }

  async getJenkins(): Promise<Jenkins> {
    if (this.lifespanContext.jenkinsSessionSingleton && this.jenkinsClient) {
      return this.jenkinsClient;
    }

    const jenkinsUrl = this.headerAuth
      ? this.headerAuth.jenkinsUrl
      : this.lifespanContext.jenkinsUrl;
    const jenkinsUsername = this.headerAuth
      ? this.headerAuth.jenkinsUsername
      : this.lifespanContext.jenkinsUsername;
    const jenkinsPassword = this.headerAuth
      ? this.headerAuth.jenkinsPassword
      : this.lifespanContext.jenkinsPassword;

    if (!(jenkinsUrl && jenkinsUsername && jenkinsPassword)) {
      throw new Error(
        "Jenkins authentication details are missing. Please provide them via x-jenkins-* headers or CLI arguments (--jenkins-url, --jenkins-username, --jenkins-password)."
      );
    }

    const client = new Jenkins({
      url: jenkinsUrl,
      username: jenkinsUsername,
      password: jenkinsPassword,
      timeout: this.lifespanContext.jenkinsTimeout,
      verifySsl: this.lifespanContext.jenkinsVerifySsl
    });

    if (this.lifespanContext.jenkinsSessionSingleton) {
      this.jenkinsClient = client;
    }

    return client;
  }
}
