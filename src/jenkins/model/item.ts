import type { Build } from "./build.js";

export interface ItemBase {
  class_: string;
  name: string;
  url: string;
  fullname?: string | undefined;
}

export interface Job extends ItemBase {
  kind: "Job";
  color: string;
  lastBuild?: Build | undefined;
}

export interface FreeStyleProject extends ItemBase {
  kind: "FreeStyleProject";
  color: string;
  lastBuild?: Build | undefined;
}

export interface Folder extends ItemBase {
  kind: "Folder";
  jobs: ItemType[];
}

export interface MultiBranchProject extends ItemBase {
  kind: "MultiBranchProject";
  jobs: ItemType[];
  lastBuild?: Build | undefined;
}

export interface UnknownItem extends ItemBase {
  kind: "UnknownItem";
  [key: string]: unknown;
}

export type ItemType = Folder | MultiBranchProject | FreeStyleProject | Job | UnknownItem;

function parseBuildSummary(value: unknown): Build | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  if (typeof raw.number !== "number" || typeof raw.url !== "string") {
    return undefined;
  }

  return {
    number: raw.number,
    url: raw.url,
    result: typeof raw.result === "string" ? raw.result : null,
    timestamp: typeof raw.timestamp === "number" ? raw.timestamp : undefined,
    duration: typeof raw.duration === "number" ? raw.duration : undefined
  };
}

function normalizeBaseItem(item: Record<string, unknown>): ItemBase {
  const className = item._class;
  const name = item.name;
  const url = item.url;
  const fullnameRaw = item.fullName ?? item.fullname;

  if (typeof className !== "string" || typeof name !== "string" || typeof url !== "string") {
    throw new Error("Invalid item payload.");
  }

  return {
    class_: className,
    name,
    url,
    fullname: typeof fullnameRaw === "string" ? fullnameRaw : undefined
  };
}

function serializeChildren(children: unknown): ItemType[] {
  if (!Array.isArray(children)) {
    return [];
  }

  return children
    .filter((child) => typeof child === "object" && child !== null)
    .map((child) => serializeItem(child));
}

export function serializeItem(itemLike: unknown): ItemType {
  if (!itemLike || typeof itemLike !== "object") {
    throw new Error("Invalid item payload.");
  }

  const item = itemLike as Record<string, unknown>;
  const base = normalizeBaseItem(item);
  const className = base.class_;

  if (className.endsWith("Folder")) {
    return {
      ...base,
      kind: "Folder",
      jobs: serializeChildren(item.jobs)
    };
  }

  if (className.endsWith("MultiBranchProject")) {
    return {
      ...base,
      kind: "MultiBranchProject",
      jobs: serializeChildren(item.jobs),
      lastBuild: parseBuildSummary(item.lastBuild)
    };
  }

  if (className.endsWith("FreeStyleProject")) {
    return {
      ...base,
      kind: "FreeStyleProject",
      color: typeof item.color === "string" ? item.color : "",
      lastBuild: parseBuildSummary(item.lastBuild)
    };
  }

  if (className.endsWith("Job")) {
    return {
      ...base,
      kind: "Job",
      color: typeof item.color === "string" ? item.color : "",
      lastBuild: parseBuildSummary(item.lastBuild)
    };
  }

  return {
    ...(item as Record<string, unknown>),
    ...base,
    kind: "UnknownItem"
  };
}

export function isColorItem(item: ItemType): item is Job | FreeStyleProject {
  return item.kind === "Job" || item.kind === "FreeStyleProject";
}
