import { describe, expect, it, vi } from "vitest";

import type { JenkinsConfig } from "../src/config.js";
import { JenkinsClient, buildJobPath } from "../src/jenkins-client.js";

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json"
    },
    ...init
  });
}

const baseConfig: JenkinsConfig = {
  baseUrl: new URL("https://jenkins.example.com/"),
  timeoutMs: 1000,
  username: "ci-user",
  apiToken: "token"
};

describe("buildJobPath", () => {
  it("builds nested job paths", () => {
    expect(buildJobPath("folder/my-job")).toBe("job/folder/job/my-job");
  });

  it("encodes job path segments", () => {
    expect(buildJobPath("folder/my job")).toBe("job/folder/job/my%20job");
  });

  it("throws on empty job name", () => {
    expect(() => buildJobPath("   ")).toThrow("jobName must not be empty");
  });
});

describe("JenkinsClient", () => {
  it("filters listJobs by name", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        jobs: [
          { name: "release-api", url: "https://jenkins.example.com/job/release-api/" },
          { name: "nightly-ui", url: "https://jenkins.example.com/job/nightly-ui/" }
        ]
      })
    );

    const client = new JenkinsClient(baseConfig, fetchMock);
    const jobs = await client.listJobs("api");

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.name).toBe("release-api");
  });

  it("triggers parameterized build with crumb header", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = input instanceof URL ? input.toString() : String(input);
      calls.push({ url, init });

      if (url.endsWith("/crumbIssuer/api/json")) {
        return jsonResponse({
          crumbRequestField: "Jenkins-Crumb",
          crumb: "crumb-value"
        });
      }

      if (url.includes("/buildWithParameters")) {
        return new Response(null, {
          status: 201,
          headers: {
            location: "https://jenkins.example.com/queue/item/42/"
          }
        });
      }

      return new Response("Not found", { status: 404 });
    });

    const client = new JenkinsClient(baseConfig, fetchMock);
    const result = await client.triggerBuild("folder/release", {
      branch: "main",
      runTests: true
    });

    const triggerCall = calls.at(-1);
    expect(triggerCall?.url).toContain("/job/folder/job/release/buildWithParameters");

    const triggerHeaders = new Headers(triggerCall?.init?.headers);
    expect(triggerHeaders.get("Jenkins-Crumb")).toBe("crumb-value");
    expect(triggerCall?.init?.body).toBe("branch=main&runTests=true");

    expect(result).toEqual({
      queued: true,
      status: 201,
      queueUrl: "https://jenkins.example.com/queue/item/42/"
    });
  });
});
