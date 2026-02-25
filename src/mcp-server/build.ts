import type { Build } from "../jenkins/model/build.js";
import type { ItemType } from "../jenkins/model/item.js";
import type { ToolRuntime } from "./runtime.js";
import { buildToOutput, removeNil } from "./serializers.js";

function resolveLastBuildNumber(item: ItemType): number {
  if (
    (item.kind === "Job" ||
      item.kind === "FreeStyleProject" ||
      item.kind === "MultiBranchProject") &&
    item.lastBuild?.number
  ) {
    return item.lastBuild.number;
  }

  throw new Error("Last build number is unavailable for this item.");
}

function runningBuildToOutput(build: Build): Record<string, unknown> {
  return removeNil({
    number: build.number,
    url: build.url,
    building: build.building,
    timestamp: build.timestamp
  }) as Record<string, unknown>;
}

export async function getRunningBuilds(
  runtime: ToolRuntime
): Promise<Array<Record<string, unknown>>> {
  const jenkins = await runtime.getJenkins();
  const builds = await jenkins.getRunningBuilds();
  return builds.map(runningBuildToOutput);
}

export async function getBuild(
  runtime: ToolRuntime,
  fullname: string,
  number?: number
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();

  let targetNumber = number;
  if (targetNumber === undefined) {
    const item = await jenkins.getItem(fullname, 1);
    targetNumber = resolveLastBuildNumber(item);
  }

  const build = await jenkins.getBuild(fullname, targetNumber);
  return buildToOutput(build);
}

export async function getBuildScripts(
  runtime: ToolRuntime,
  fullname: string,
  number?: number
): Promise<string[]> {
  const jenkins = await runtime.getJenkins();

  let targetNumber = number;
  if (targetNumber === undefined) {
    const item = await jenkins.getItem(fullname, 1);
    targetNumber = resolveLastBuildNumber(item);
  }

  const replay = await jenkins.getBuildReplay(fullname, targetNumber);
  return replay.scripts;
}

export async function getBuildConsoleOutput(
  runtime: ToolRuntime,
  fullname: string,
  number?: number
): Promise<string> {
  const jenkins = await runtime.getJenkins();

  let targetNumber = number;
  if (targetNumber === undefined) {
    const item = await jenkins.getItem(fullname, 1);
    targetNumber = resolveLastBuildNumber(item);
  }

  return jenkins.getBuildConsoleOutput(fullname, targetNumber);
}

export async function getBuildTestReport(
  runtime: ToolRuntime,
  fullname: string,
  number?: number
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();

  let targetNumber = number;
  if (targetNumber === undefined) {
    const item = await jenkins.getItem(fullname, 1);
    targetNumber = resolveLastBuildNumber(item);
  }

  return jenkins.getBuildTestReport(fullname, targetNumber);
}

export async function stopBuild(
  runtime: ToolRuntime,
  fullname: string,
  number: number
): Promise<void> {
  const jenkins = await runtime.getJenkins();
  await jenkins.stopBuild(fullname, number);
}
