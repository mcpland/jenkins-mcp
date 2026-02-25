import type { Build } from "../jenkins/model/build.js";
import type { ItemType } from "../jenkins/model/item.js";

function removeNil(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeNil);
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (nestedValue === null || nestedValue === undefined) {
        continue;
      }
      output[key] = removeNil(nestedValue);
    }
    return output;
  }

  return value;
}

export function buildToOutput(build: Build): Record<string, unknown> {
  return removeNil({
    number: build.number,
    url: build.url,
    timestamp: build.timestamp,
    duration: build.duration,
    estimatedDuration: build.estimatedDuration,
    building: build.building,
    result: build.result,
    nextBuild: build.nextBuild ? buildToOutput(build.nextBuild) : undefined,
    previousBuild: build.previousBuild ? buildToOutput(build.previousBuild) : undefined
  }) as Record<string, unknown>;
}

export function itemToOutput(item: ItemType): Record<string, unknown> {
  const base = {
    class_: item.class_,
    name: item.name,
    url: item.url,
    fullname: item.fullname
  };

  if (item.kind === "Folder") {
    return removeNil({
      ...base,
      jobs: item.jobs.map(itemToOutput)
    }) as Record<string, unknown>;
  }

  if (item.kind === "MultiBranchProject") {
    return removeNil({
      ...base,
      jobs: item.jobs.map(itemToOutput),
      lastBuild: item.lastBuild ? buildToOutput(item.lastBuild) : undefined
    }) as Record<string, unknown>;
  }

  if (item.kind === "FreeStyleProject" || item.kind === "Job") {
    return removeNil({
      ...base,
      color: item.color,
      lastBuild: item.lastBuild ? buildToOutput(item.lastBuild) : undefined
    }) as Record<string, unknown>;
  }

  const output = { ...item } as Record<string, unknown>;
  delete output.kind;
  delete output._class;
  delete output.fullName;

  return removeNil({ ...output, ...base }) as Record<string, unknown>;
}
