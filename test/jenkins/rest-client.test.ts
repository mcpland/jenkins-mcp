import { describe, expect, it, vi } from "vitest";

import { Jenkins, JenkinsHttpError } from "../../src/jenkins/rest-client.js";

type FetchInput = Parameters<typeof fetch>[0];

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json"
    },
    ...init
  });
}

function getUrlFromFetchInput(input: FetchInput | URL): string {
  if (input instanceof URL) {
    return input.toString();
  }
  if (typeof input === "string") {
    return input;
  }
  return input.url;
}

function createClient(fetchMock: typeof fetch): Jenkins {
  const client = new Jenkins(
    {
      url: "https://example.com/",
      username: "username",
      password: "password",
      timeout: 5,
      verifySsl: true
    },
    fetchMock
  );

  (client as unknown as { _crumbHeader: Record<string, string> })._crumbHeader = {
    "Jenkins-Crumb": "crumb-value"
  };

  return client;
}

describe("Jenkins.endpointUrl", () => {
  it("normalizes slashes", () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    const jenkins = createClient(fetchMock);

    expect(jenkins.endpointUrl("/api/json")).toBe("https://example.com/api/json");
    expect(jenkins.endpointUrl("api/json")).toBe("https://example.com/api/json");
  });
});

describe("Jenkins.request", () => {
  it("sends request with crumb by default", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    const jenkins = createClient(fetchMock);

    await jenkins.request("GET", "api/json");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as [FetchInput | URL, RequestInit];
    expect(getUrlFromFetchInput(input)).toBe("https://example.com/api/json");

    const headers = new Headers(init.headers);
    expect(headers.get("Jenkins-Crumb")).toBe("crumb-value");
    expect(headers.get("Authorization")).toBe("Basic dXNlcm5hbWU6cGFzc3dvcmQ=");
  });

  it("sends request without crumb when disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    const jenkins = createClient(fetchMock);

    await jenkins.request("GET", "api/json", {
      crumb: false,
      headers: {
        "Custom-Header": "value"
      }
    });

    const [, init] = fetchMock.mock.calls[0] as [FetchInput | URL, RequestInit];
    const headers = new Headers(init.headers);

    expect(headers.get("Custom-Header")).toBe("value");
    expect(headers.get("Jenkins-Crumb")).toBeNull();
  });
});

describe("Jenkins.crumbHeader", () => {
  it("fetches crumb header from Jenkins", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        crumbRequestField: "Jenkins-Crumb",
        crumb: "crumb-value"
      })
    );

    const jenkins = new Jenkins(
      {
        url: "https://example.com/",
        username: "username",
        password: "password"
      },
      fetchMock
    );

    await expect(jenkins.crumbHeader()).resolves.toEqual({
      "Jenkins-Crumb": "crumb-value"
    });
  });

  it("returns empty crumb header on 404", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("Not found", { status: 404 }));

    const jenkins = new Jenkins(
      {
        url: "https://example.com/",
        username: "username",
        password: "password"
      },
      fetchMock
    );

    await expect(jenkins.crumbHeader()).resolves.toEqual({});
  });

  it("rethrows non-404 errors", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("Boom", { status: 500 }));

    const jenkins = new Jenkins(
      {
        url: "https://example.com/",
        username: "username",
        password: "password"
      },
      fetchMock
    );

    await expect(jenkins.crumbHeader()).rejects.toBeInstanceOf(JenkinsHttpError);
  });
});

describe("Jenkins.parseFullname", () => {
  it("parses job path and name", () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    const jenkins = createClient(fetchMock);

    expect(jenkins.parseFullname("job-name")).toEqual(["", "job-name"]);
    expect(jenkins.parseFullname("folder/job-name")).toEqual(["job/folder/", "job-name"]);
    expect(jenkins.parseFullname("folder/subfolder/job-name")).toEqual([
      "job/folder/job/subfolder/",
      "job-name"
    ]);
  });
});

describe("Queue operations", () => {
  it("gets queue", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 1,
            inQueueSince: 1767975558000,
            url: "https://example.com/queue/item/1/",
            why: "Waiting for next available executor",
            task: {
              fullDisplayName: "Example Job",
              name: "example-job",
              url: "https://example.com/job/example-job/"
            }
          }
        ],
        discoverableItems: []
      })
    );

    const jenkins = createClient(fetchMock);
    await expect(jenkins.getQueue()).resolves.toEqual({
      items: [
        {
          id: 1,
          inQueueSince: 1767975558000,
          url: "https://example.com/queue/item/1/",
          why: "Waiting for next available executor",
          task: {
            fullDisplayName: "Example Job",
            name: "example-job",
            url: "https://example.com/job/example-job/"
          }
        }
      ],
      discoverableItems: []
    });
  });

  it("gets queue item", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        id: 1,
        inQueueSince: 1767975558000,
        url: "https://example.com/queue/item/1/",
        why: "Waiting for next available executor",
        task: {
          fullDisplayName: "Example Job",
          name: "example-job",
          url: "https://example.com/job/example-job/"
        }
      })
    );

    const jenkins = createClient(fetchMock);

    await expect(jenkins.getQueueItem(1)).resolves.toEqual({
      id: 1,
      inQueueSince: 1767975558000,
      url: "https://example.com/queue/item/1/",
      why: "Waiting for next available executor",
      task: {
        fullDisplayName: "Example Job",
        name: "example-job",
        url: "https://example.com/job/example-job/"
      }
    });
  });

  it("cancels queue item", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    const jenkins = createClient(fetchMock);

    await jenkins.cancelQueueItem(42);

    const [input] = fetchMock.mock.calls[0] as [FetchInput | URL, RequestInit];
    expect(getUrlFromFetchInput(input)).toBe("https://example.com/queue/cancelItem?id=42");
  });
});

describe("Node operations", () => {
  it("gets node", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        displayName: "node-1",
        offline: false,
        executors: [
          {
            currentExecutable: {
              url: "https://example.com/job/example-job/1/",
              timestamp: 1767975558000,
              number: 1,
              fullDisplayName: "Example Job #1"
            }
          }
        ]
      })
    );

    const jenkins = createClient(fetchMock);
    await expect(jenkins.getNode("node-1")).resolves.toEqual({
      displayName: "node-1",
      offline: false,
      executors: [
        {
          currentExecutable: {
            url: "https://example.com/job/example-job/1/",
            timestamp: 1767975558000,
            number: 1,
            fullDisplayName: "Example Job #1"
          }
        }
      ]
    });

    const [input] = fetchMock.mock.calls[0] as [FetchInput | URL, RequestInit];
    expect(getUrlFromFetchInput(input)).toBe("https://example.com/computer/node-1/api/json?depth=0");
  });

  it("maps Built-In Node to (master)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        displayName: "Built-In Node",
        offline: false,
        executors: []
      })
    );

    const jenkins = createClient(fetchMock);
    await jenkins.getNode("Built-In Node");

    const [input] = fetchMock.mock.calls[0] as [FetchInput | URL, RequestInit];
    expect(getUrlFromFetchInput(input)).toBe("https://example.com/computer/(master)/api/json?depth=0");
  });

  it("gets all nodes", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        computer: [
          {
            displayName: "node-1",
            offline: false,
            executors: []
          },
          {
            displayName: "Built-In Node",
            offline: true,
            executors: []
          }
        ]
      })
    );

    const jenkins = createClient(fetchMock);

    await expect(jenkins.getNodes()).resolves.toEqual([
      { displayName: "node-1", offline: false, executors: [] },
      { displayName: "Built-In Node", offline: true, executors: [] }
    ]);
  });

  it("gets and sets node config", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("<node>config</node>", { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({}));

    const jenkins = createClient(fetchMock);
    await expect(jenkins.getNodeConfig("node-1")).resolves.toBe("<node>config</node>");

    await jenkins.setNodeConfig("node-1", "<node>new config</node>");

    const [, init] = fetchMock.mock.calls[1] as [FetchInput | URL, RequestInit];
    const headers = new Headers(init.headers);

    expect(headers.get("Content-Type")).toBe("text/xml; charset=utf-8");
    expect(init.body).toBe("<node>new config</node>");
  });
});

describe("Build operations", () => {
  it("gets build", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        number: 2,
        url: "https://example.com/job/example-job/2/",
        timestamp: 1767975558000,
        duration: 120000,
        estimatedDuration: 130000,
        building: false,
        result: "SUCCESS",
        nextBuild: null,
        previousBuild: {
          number: 1,
          url: "https://example.com/job/example-job/1/"
        }
      })
    );

    const jenkins = createClient(fetchMock);
    await expect(jenkins.getBuild("example-job", 1)).resolves.toEqual({
      number: 2,
      url: "https://example.com/job/example-job/2/",
      timestamp: 1767975558000,
      duration: 120000,
      estimatedDuration: 130000,
      building: false,
      result: "SUCCESS",
      nextBuild: null,
      previousBuild: {
        number: 1,
        url: "https://example.com/job/example-job/1/",
        duration: undefined,
        estimatedDuration: undefined,
        building: undefined,
        result: null,
        nextBuild: null,
        previousBuild: null,
        timestamp: undefined
      }
    });
  });

  it("gets console output and stop build", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Console output here", { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({}));

    const jenkins = createClient(fetchMock);

    await expect(jenkins.getBuildConsoleOutput("example-job", 1)).resolves.toBe("Console output here");
    await jenkins.stopBuild("example-job", 42);

    const [input] = fetchMock.mock.calls[1] as [FetchInput | URL, RequestInit];
    expect(getUrlFromFetchInput(input)).toBe("https://example.com/job/example-job/42/stop");
  });

  it("extracts build replay scripts", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        '<textarea name="_.mainScript" checkMethod="post">main script code here</textarea>' +
          '<textarea name="_.additionalScripts" checkMethod="post">additional script code here</textarea>' +
          "<body>Foo</body>",
        { status: 200 }
      )
    );

    const jenkins = createClient(fetchMock);
    await expect(jenkins.getBuildReplay("example-job", 1)).resolves.toEqual({
      scripts: ["main script code here", "additional script code here"]
    });
  });

  it("gets build test report", async () => {
    const report = {
      suites: [
        {
          name: "Example Suite",
          cases: [
            { name: "test_case_1", className: "ExampleTest", status: "PASSED" },
            {
              name: "test_case_2",
              className: "ExampleTest",
              status: "FAILED",
              errorDetails: "AssertionError"
            }
          ]
        }
      ]
    };

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(report));
    const jenkins = createClient(fetchMock);

    await expect(jenkins.getBuildTestReport("example-job", 1)).resolves.toEqual(report);
  });

  it("gets running builds", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        computer: [
          {
            displayName: "node-1",
            offline: false,
            executors: [
              {
                currentExecutable: {
                  number: 3,
                  url: "https://example.com/job/example-job/3/",
                  timestamp: 1767975558000,
                  fullDisplayName: "Example Job #3"
                }
              }
            ]
          }
        ]
      })
    );

    const jenkins = createClient(fetchMock);
    await expect(jenkins.getRunningBuilds()).resolves.toEqual([
      {
        number: 3,
        url: "https://example.com/job/example-job/3/",
        timestamp: 1767975558000,
        duration: undefined,
        estimatedDuration: undefined,
        building: undefined,
        result: null,
        nextBuild: null,
        previousBuild: null
      }
    ]);
  });
});

describe("Item operations", () => {
  it("gets item list with nested items", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        jobs: [
          {
            name: "example-job",
            url: "https://example.com/job/example-job/",
            _class: "hudson.model.WorkflowJob",
            color: "blue",
            fullName: "example-job"
          },
          {
            name: "example-folder",
            url: "https://example.com/job/example-folder/",
            _class: "com.cloudbees.hudson.plugins.folder.Folder",
            fullName: "example-folder",
            jobs: [
              {
                name: "nested-job",
                url: "https://example.com/job/example-folder/job/nested-job/",
                _class: "hudson.model.FreeStyleProject",
                color: "red",
                fullname: "example-folder"
              },
              {
                name: "nested-multibranch",
                url: "https://example.com/job/example-folder/job/nested-multibranch",
                _class: "org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject",
                fullname: "example-multibranch",
                jobs: [
                  {
                    name: "example-job",
                    url: "https://example.com/job/example-folder/job/nested-multibranch/job/example-job/",
                    _class: "hudson.model.WorkflowJob",
                    color: "blue",
                    fullname: "example-multibranch/job/example-job"
                  }
                ]
              }
            ]
          }
        ]
      })
    );

    const jenkins = createClient(fetchMock);
    const items = await jenkins.getItems();

    expect(items).toHaveLength(5);
    expect(items[0]).toMatchObject({
      kind: "Job",
      class_: "hudson.model.WorkflowJob",
      fullname: "example-job"
    });
    expect(items[1]).toMatchObject({
      kind: "Folder",
      fullname: "example-folder"
    });
    expect(items[2]).toMatchObject({
      kind: "FreeStyleProject",
      fullname: "example-folder",
      color: "red"
    });
  });

  it("gets item and item config", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          name: "example-folder",
          url: "https://example.com/job/example-folder/",
          _class: "com.cloudbees.hudson.plugins.folder.Folder",
          fullName: "example-folder",
          jobs: [
            {
              name: "nested-job",
              url: "https://example.com/job/example-folder/job/nested-job/",
              _class: "hudson.model.WorkflowJob",
              color: "red",
              fullname: "example-folder/example-job"
            }
          ]
        })
      )
      .mockResolvedValueOnce(new Response("<project>config</project>", { status: 200 }));

    const jenkins = createClient(fetchMock);

    await expect(jenkins.getItem("example-folder")).resolves.toMatchObject({
      kind: "Folder",
      fullname: "example-folder"
    });
    await expect(jenkins.getItemConfig("example-job")).resolves.toBe("<project>config</project>");
  });

  it("sets item config", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    const jenkins = createClient(fetchMock);

    await jenkins.setItemConfig("example-job", "<project>new config</project>");

    const [, init] = fetchMock.mock.calls[0] as [FetchInput | URL, RequestInit];
    const headers = new Headers(init.headers);

    expect(headers.get("Content-Type")).toBe("text/xml; charset=utf-8");
    expect(init.body).toBe("<project>new config</project>");
  });

  it("queries items by class/fullname/color", async () => {
    const jobsPayload = {
      jobs: [
        {
          name: "example-job",
          url: "https://example.com/job/example-job/",
          _class: "hudson.model.WorkflowJob",
          color: "blue",
          fullName: "example-job"
        },
        {
          name: "another-job",
          url: "https://example.com/job/another-job/",
          _class: "hudson.model.FreeStyleProject",
          color: "red",
          fullName: "another-job"
        }
      ]
    };
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(jobsPayload));

    const jenkins = createClient(fetchMock);

    await expect(jenkins.queryItems({ classPattern: ".*WorkflowJob" })).resolves.toHaveLength(1);
    await expect(jenkins.queryItems({ colorPattern: "red" })).resolves.toHaveLength(1);
    await expect(jenkins.queryItems({ fullnamePattern: "example" })).resolves.toHaveLength(1);
  });

  it("triggers build item and returns queue id", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 201,
        headers: {
          Location: "https://example.com/queue/item/123/"
        }
      })
    );

    const jenkins = createClient(fetchMock);

    await expect(
      jenkins.buildItem("example-job", "buildWithParameters", {
        param1: "value1"
      })
    ).resolves.toBe(123);

    const [input] = fetchMock.mock.calls[0] as [FetchInput | URL, RequestInit];
    expect(getUrlFromFetchInput(input)).toBe(
      "https://example.com/job/example-job/buildWithParameters?param1=value1"
    );
  });
});
