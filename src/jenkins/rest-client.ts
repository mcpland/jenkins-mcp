import { type Build, type BuildReplay, parseBuild, parseBuildReplay } from "./model/build.js";
import { type ItemType, isColorItem, serializeItem } from "./model/item.js";
import { type Node, parseNode } from "./model/node.js";
import { type Queue, type QueueItem, parseQueue, parseQueueItem } from "./model/queue.js";
import {
  BUILD,
  BUILD_CONSOLE_OUTPUT,
  BUILD_REPLAY,
  BUILD_STOP,
  BUILD_TEST_REPORT,
  CRUMB,
  ITEM,
  ITEM_BUILD,
  ITEM_CONFIG,
  ITEMS,
  NODE,
  NODE_CONFIG,
  NODES,
  QUEUE,
  QUEUE_CANCEL_ITEM,
  QUEUE_ITEM
} from "./rest-endpoint.js";

export type JenkinsHttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface JenkinsOptions {
  url: string;
  username: string;
  password: string;
  timeout?: number;
  verifySsl?: boolean;
}

export interface RequestOptions {
  data?: Record<string, string | number | boolean> | string;
  headers?: Record<string, string>;
  crumb?: boolean;
  params?: Record<string, string | number | boolean>;
}

export class JenkinsHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseText: string
  ) {
    super(message);
    this.name = "JenkinsHttpError";
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function toBuildReplayFromHtml(html: string): BuildReplay {
  const scriptNamePattern = /_\..*Script.*/;
  const textareaPattern = /<textarea\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/gi;
  const scripts: string[] = [];

  for (const match of html.matchAll(textareaPattern)) {
    const name = match[1];
    const content = match[2] ?? "";

    if (name && scriptNamePattern.test(name)) {
      scripts.push(decodeHtmlEntities(content));
    }
  }

  return parseBuildReplay({ scripts });
}

export class Jenkins {
  static readonly DEFAULT_HEADERS = { "Content-Type": "text/xml; charset=utf-8" };

  readonly url: string;
  readonly timeout: number;
  readonly verifySsl: boolean;

  private readonly username: string;
  private readonly password: string;
  private readonly fetchImpl: typeof fetch;
  private _crumbHeader: Record<string, string> | null = null;

  constructor(options: JenkinsOptions, fetchImpl: typeof fetch = fetch) {
    this.url = options.url;
    this.username = options.username;
    this.password = options.password;
    this.timeout = options.timeout ?? 75;
    this.verifySsl = options.verifySsl ?? true;
    this.fetchImpl = fetchImpl;
  }

  endpointUrl(endpoint: string): string {
    return [this.url, endpoint]
      .map((segment) => String(segment).replace(/^\/+|\/+$/g, ""))
      .join("/");
  }

  async request(
    method: JenkinsHttpMethod,
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<Response> {
    const { data, headers, crumb = true, params } = options;

    const finalHeaders = new Headers(headers);
    if (crumb) {
      const crumbHeader = await this.crumbHeader();
      for (const [key, value] of Object.entries(crumbHeader)) {
        finalHeaders.set(key, value);
      }
    }

    const credentials = Buffer.from(`${this.username}:${this.password}`).toString("base64");
    finalHeaders.set("Authorization", `Basic ${credentials}`);

    const requestUrl = new URL(this.endpointUrl(endpoint));
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        requestUrl.searchParams.set(key, String(value));
      }
    }

    const requestInit: RequestInit = {
      method,
      headers: finalHeaders
    };

    if (typeof data === "string") {
      requestInit.body = data;
    } else if (data) {
      const formBody = new URLSearchParams();
      for (const [key, value] of Object.entries(data)) {
        formBody.set(key, String(value));
      }
      requestInit.body = formBody;
    }

    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(() => timeoutController.abort(), this.timeout * 1000);
    requestInit.signal = timeoutController.signal;

    try {
      const response = await this.fetchImpl(requestUrl, requestInit);
      if (!response.ok) {
        throw new JenkinsHttpError(
          `Jenkins request failed with status ${response.status}`,
          response.status,
          await response.text()
        );
      }
      return response;
    } catch (error) {
      if (error instanceof JenkinsHttpError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new JenkinsHttpError(
          `Jenkins request timed out after ${this.timeout} seconds`,
          408,
          ""
        );
      }

      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async crumbHeader(): Promise<Record<string, string>> {
    if (this._crumbHeader !== null) {
      return this._crumbHeader;
    }

    try {
      const response = await this.request("GET", CRUMB.call({}), { crumb: false });
      const crumb = (await response.json()) as { crumbRequestField?: string; crumb?: string };
      if (crumb.crumbRequestField && crumb.crumb) {
        this._crumbHeader = { [crumb.crumbRequestField]: crumb.crumb };
      } else {
        this._crumbHeader = {};
      }
    } catch (error) {
      if (error instanceof JenkinsHttpError && error.status === 404) {
        this._crumbHeader = {};
      } else {
        throw error;
      }
    }

    return this._crumbHeader;
  }

  parseFullname(fullname: string): [string, string] {
    const parts = fullname.split("/");
    const name = parts.at(-1) ?? "";
    const folder = parts.length > 1 ? `job/${parts.slice(0, -1).join("/job/")}/` : "";
    return [folder, name];
  }

  async getQueue(depth = 1): Promise<Queue> {
    const response = await this.request("GET", QUEUE.call({ depth }));
    return parseQueue(await response.json());
  }

  async getQueueItem(id: number, depth = 0): Promise<QueueItem> {
    const response = await this.request("GET", QUEUE_ITEM.call({ id, depth }));
    return parseQueueItem(await response.json());
  }

  async cancelQueueItem(id: number): Promise<void> {
    await this.request("POST", QUEUE_CANCEL_ITEM.call({ id }));
  }

  async getNode(name: string, depth = 0): Promise<Node> {
    const normalizedName = name === "master" || name === "Built-In Node" ? "(master)" : name;
    const response = await this.request("GET", NODE.call({ name: normalizedName, depth }));
    return parseNode(await response.json());
  }

  async getNodes(depth = 0): Promise<Node[]> {
    const response = await this.request("GET", NODES.call({ depth }));
    const payload = (await response.json()) as { computer?: unknown[] };
    return (payload.computer ?? []).map(parseNode);
  }

  async getNodeConfig(name: string): Promise<string> {
    const response = await this.request("GET", NODE_CONFIG.call({ name }));
    return response.text();
  }

  async setNodeConfig(name: string, configXml: string): Promise<void> {
    await this.request("POST", NODE_CONFIG.call({ name }), {
      headers: Jenkins.DEFAULT_HEADERS,
      data: configXml
    });
  }

  async getBuild(fullname: string, number: number, depth = 0): Promise<Build> {
    const [folder, name] = this.parseFullname(fullname);
    const response = await this.request("GET", BUILD.call({ folder, name, number, depth }));
    return parseBuild(await response.json());
  }

  async getBuildConsoleOutput(fullname: string, number: number): Promise<string> {
    const [folder, name] = this.parseFullname(fullname);
    const response = await this.request("GET", BUILD_CONSOLE_OUTPUT.call({ folder, name, number }));
    return response.text();
  }

  async stopBuild(fullname: string, number: number): Promise<void> {
    const [folder, name] = this.parseFullname(fullname);
    await this.request("POST", BUILD_STOP.call({ folder, name, number }));
  }

  async getBuildReplay(fullname: string, number: number): Promise<BuildReplay> {
    const [folder, name] = this.parseFullname(fullname);
    const response = await this.request("GET", BUILD_REPLAY.call({ folder, name, number }));
    return toBuildReplayFromHtml(await response.text());
  }

  async getBuildTestReport(
    fullname: string,
    number: number,
    depth = 0
  ): Promise<Record<string, unknown>> {
    const [folder, name] = this.parseFullname(fullname);
    const response = await this.request(
      "GET",
      BUILD_TEST_REPORT.call({ folder, name, number, depth })
    );
    return (await response.json()) as Record<string, unknown>;
  }

  async getRunningBuilds(): Promise<Build[]> {
    const builds: Build[] = [];

    for (const node of await this.getNodes(2)) {
      for (const executor of node.executors) {
        if (executor.currentExecutable?.number) {
          builds.push(parseBuild(executor.currentExecutable));
        }
      }
    }

    return builds;
  }

  async getItems(folderDepth?: number, folderDepthPerRequest = 10): Promise<ItemType[]> {
    const query = Array.from({ length: folderDepthPerRequest }).reduce<string>(
      (currentQuery) => `jobs[url,color,name,${currentQuery}]`,
      "jobs"
    );

    const response = await this.request("GET", ITEMS.call({ folder: "", query }));
    const payload = (await response.json()) as { jobs?: unknown[] };

    const items: ItemType[] = [];
    const itemStack: Array<[number, string[], unknown]> = [[0, [], payload.jobs ?? []]];

    for (const [level, path, levelItems] of itemStack) {
      const currentItems = Array.isArray(levelItems) ? levelItems : [levelItems];

      for (const rawItem of currentItems) {
        if (!rawItem || typeof rawItem !== "object") {
          continue;
        }

        const itemRecord = rawItem as Record<string, unknown>;
        const name = itemRecord.name;
        if (typeof name !== "string") {
          continue;
        }

        const jobPath = [...path, name];
        if (typeof itemRecord.fullname !== "string" && typeof itemRecord.fullName !== "string") {
          itemRecord.fullname = jobPath.join("/");
        }

        const serialized = serializeItem(itemRecord);
        items.push(serialized);

        const children = itemRecord.jobs;
        if (Array.isArray(children) && (folderDepth === undefined || level < folderDepth)) {
          itemStack.push([level + 1, jobPath, children]);
        }
      }
    }

    return items;
  }

  async getItem(fullname: string, depth = 0): Promise<ItemType> {
    const [folder, name] = this.parseFullname(fullname);
    const response = await this.request("GET", ITEM.call({ folder, name, depth }));
    return serializeItem(await response.json());
  }

  async getItemConfig(fullname: string): Promise<string> {
    const [folder, name] = this.parseFullname(fullname);
    const response = await this.request("GET", ITEM_CONFIG.call({ folder, name }));
    return response.text();
  }

  async setItemConfig(fullname: string, configXml: string): Promise<void> {
    const [folder, name] = this.parseFullname(fullname);
    await this.request("POST", ITEM_CONFIG.call({ folder, name }), {
      headers: Jenkins.DEFAULT_HEADERS,
      data: configXml
    });
  }

  async queryItems(options: {
    folderDepth?: number;
    folderDepthPerRequest?: number;
    classPattern?: string;
    fullnamePattern?: string;
    colorPattern?: string;
  }): Promise<ItemType[]> {
    const {
      folderDepth,
      folderDepthPerRequest = 10,
      classPattern,
      fullnamePattern,
      colorPattern
    } = options;

    const classRegex = classPattern ? new RegExp(classPattern) : null;
    const fullnameRegex = fullnamePattern ? new RegExp(fullnamePattern) : null;
    const colorRegex = colorPattern ? new RegExp(colorPattern) : null;

    const items = await this.getItems(folderDepth, folderDepthPerRequest);

    const result: ItemType[] = [];
    for (const item of items) {
      if (classRegex && !classRegex.test(item.class_)) {
        continue;
      }

      if (!item.fullname || (fullnameRegex && !fullnameRegex.test(item.fullname))) {
        continue;
      }

      if (colorRegex) {
        if (!isColorItem(item) || !colorRegex.test(item.color)) {
          continue;
        }
      }

      result.push(item);
    }

    return result;
  }

  async buildItem(
    fullname: string,
    buildType: "build" | "buildWithParameters",
    params?: Record<string, string | number | boolean>
  ): Promise<number> {
    const [folder, name] = this.parseFullname(fullname);
    const requestOptions: RequestOptions = {};
    if (params) {
      requestOptions.params = params;
    }

    const response = await this.request(
      "POST",
      ITEM_BUILD.call({ folder, name, build_type: buildType }),
      requestOptions
    );

    const location = response.headers.get("Location");
    if (!location) {
      throw new Error("Missing queue location in Jenkins response.");
    }

    const queueId = Number.parseInt(
      location.trim().replace(/\/+$/, "").split("/").at(-1) ?? "",
      10
    );
    if (!Number.isFinite(queueId)) {
      throw new Error(`Invalid queue location: ${location}`);
    }

    return queueId;
  }
}
