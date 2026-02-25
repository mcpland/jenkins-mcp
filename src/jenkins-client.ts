import type { JenkinsConfig } from "./config.js";

export type JenkinsBuildParameters = Record<string, string | number | boolean>;

export interface JenkinsJobSummary {
  name: string;
  url: string;
  color?: string;
}

export interface JenkinsJobDetails {
  name: string;
  fullName?: string;
  url: string;
  color?: string;
  buildable?: boolean;
  lastBuild?: {
    number: number;
    url: string;
    result?: string;
    timestamp?: number;
    duration?: number;
  };
}

export interface JenkinsBuildDetails {
  number: number;
  url: string;
  result?: string;
  building?: boolean;
  timestamp?: number;
  duration?: number;
  actions?: unknown[];
}

export interface TriggerBuildResult {
  queued: boolean;
  status: number;
  queueUrl: string | null;
}

interface JenkinsCrumb {
  crumbRequestField: string;
  crumb: string;
}

type FetchLike = typeof fetch;

export class JenkinsApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = "JenkinsApiError";
  }
}

export function buildJobPath(jobName: string): string {
  const segments = jobName
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error("jobName must not be empty.");
  }

  return segments.map((segment) => `job/${encodeURIComponent(segment)}`).join("/");
}

export class JenkinsClient {
  private crumbHeader: Record<string, string> | null = null;

  constructor(
    private readonly config: JenkinsConfig,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async listJobs(nameFilter?: string): Promise<JenkinsJobSummary[]> {
    const response = await this.request("/api/json?tree=jobs[name,url,color]");
    const payload = (await response.json()) as { jobs?: JenkinsJobSummary[] };

    const jobs = payload.jobs ?? [];
    if (!nameFilter) {
      return jobs;
    }

    const normalizedFilter = nameFilter.toLowerCase();
    return jobs.filter((job) => job.name.toLowerCase().includes(normalizedFilter));
  }

  async getJob(jobName: string): Promise<JenkinsJobDetails> {
    const response = await this.request(
      `/${buildJobPath(jobName)}/api/json?tree=name,fullName,url,color,buildable,lastBuild[number,url,result,timestamp,duration]`
    );
    return (await response.json()) as JenkinsJobDetails;
  }

  async getBuild(jobName: string, buildNumber: number): Promise<JenkinsBuildDetails> {
    const response = await this.request(
      `/${buildJobPath(jobName)}/${buildNumber}/api/json?tree=number,url,result,building,timestamp,duration,actions[parameters[name,value]]`
    );
    return (await response.json()) as JenkinsBuildDetails;
  }

  async triggerBuild(
    jobName: string,
    parameters?: JenkinsBuildParameters
  ): Promise<TriggerBuildResult> {
    const hasParameters = parameters !== undefined && Object.keys(parameters).length > 0;
    const endpoint = hasParameters ? "buildWithParameters" : "build";

    const headers = new Headers(await this.getCrumbHeaders());
    let body: string | undefined;

    if (hasParameters) {
      const formBody = new URLSearchParams();
      for (const [key, value] of Object.entries(parameters)) {
        formBody.set(key, String(value));
      }
      body = formBody.toString();
      headers.set("Content-Type", "application/x-www-form-urlencoded");
      headers.set("Accept", "*/*");
    }

    const requestInit: RequestInit = {
      method: "POST",
      headers
    };

    if (body !== undefined) {
      requestInit.body = body;
    }

    const response = await this.request(`/${buildJobPath(jobName)}/${endpoint}`, requestInit);

    return {
      queued: response.status >= 200 && response.status < 300,
      status: response.status,
      queueUrl: response.headers.get("location")
    };
  }

  private async getCrumbHeaders(): Promise<Record<string, string>> {
    if (this.crumbHeader) {
      return this.crumbHeader;
    }

    try {
      const response = await this.request("/crumbIssuer/api/json");
      const payload = (await response.json()) as Partial<JenkinsCrumb>;

      if (payload.crumb && payload.crumbRequestField) {
        this.crumbHeader = {
          [payload.crumbRequestField]: payload.crumb
        };
        return this.crumbHeader;
      }
    } catch {
      // Some Jenkins setups disable CSRF crumbs. We can still attempt POST without it.
    }

    return {};
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const requestUrl = new URL(path, this.config.baseUrl);
    const headers = new Headers(init.headers);

    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }

    if (this.config.username && this.config.apiToken) {
      const credentials = Buffer.from(`${this.config.username}:${this.config.apiToken}`).toString(
        "base64"
      );
      headers.set("Authorization", `Basic ${credentials}`);
    }

    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(() => timeoutController.abort(), this.config.timeoutMs);

    try {
      const response = await this.fetchImpl(requestUrl, {
        ...init,
        headers,
        signal: timeoutController.signal
      });

      if (!response.ok) {
        const responseBody = await response.text();
        throw new JenkinsApiError(
          `Jenkins request failed: ${response.status} ${response.statusText}`,
          response.status,
          responseBody.slice(0, 500)
        );
      }

      return response;
    } catch (error) {
      if (error instanceof JenkinsApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new JenkinsApiError(`Jenkins request timed out after ${this.config.timeoutMs}ms.`);
      }

      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
