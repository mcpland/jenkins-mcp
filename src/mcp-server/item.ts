import type { ToolRuntime } from "./runtime.js";
import { itemToOutput } from "./serializers.js";

export async function getAllItems(runtime: ToolRuntime): Promise<Array<Record<string, unknown>>> {
  const jenkins = await runtime.getJenkins();
  const items = await jenkins.getItems();
  return items.map(itemToOutput);
}

export async function getItem(
  runtime: ToolRuntime,
  fullname: string
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();
  const item = await jenkins.getItem(fullname);
  return itemToOutput(item);
}

export async function getItemConfig(runtime: ToolRuntime, fullname: string): Promise<string> {
  const jenkins = await runtime.getJenkins();
  return jenkins.getItemConfig(fullname);
}

export async function setItemConfig(
  runtime: ToolRuntime,
  fullname: string,
  configXml: string
): Promise<void> {
  const jenkins = await runtime.getJenkins();
  await jenkins.setItemConfig(fullname, configXml);
}

export async function queryItems(
  runtime: ToolRuntime,
  classPattern?: string,
  fullnamePattern?: string,
  colorPattern?: string
): Promise<Array<Record<string, unknown>>> {
  const jenkins = await runtime.getJenkins();
  const queryOptions: {
    classPattern?: string;
    fullnamePattern?: string;
    colorPattern?: string;
  } = {};

  if (classPattern !== undefined) {
    queryOptions.classPattern = classPattern;
  }
  if (fullnamePattern !== undefined) {
    queryOptions.fullnamePattern = fullnamePattern;
  }
  if (colorPattern !== undefined) {
    queryOptions.colorPattern = colorPattern;
  }

  const items = await jenkins.queryItems(queryOptions);
  return items.map(itemToOutput);
}

export async function buildItem(
  runtime: ToolRuntime,
  fullname: string,
  buildType: "build" | "buildWithParameters",
  params?: Record<string, string | number | boolean>
): Promise<number> {
  const jenkins = await runtime.getJenkins();
  return jenkins.buildItem(fullname, buildType, params);
}
