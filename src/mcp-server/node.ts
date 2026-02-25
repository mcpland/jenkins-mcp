import type { ToolRuntime } from "./runtime.js";
import { nodeToOutput } from "./serializers.js";

export async function getAllNodes(runtime: ToolRuntime): Promise<Array<Record<string, unknown>>> {
  const jenkins = await runtime.getJenkins();
  const nodes = await jenkins.getNodes(0);
  return nodes.map((node) => nodeToOutput(node, false));
}

export async function getNode(
  runtime: ToolRuntime,
  name: string
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();
  const node = await jenkins.getNode(name, 2);
  return nodeToOutput(node, true);
}

export async function getNodeConfig(runtime: ToolRuntime, name: string): Promise<string> {
  const jenkins = await runtime.getJenkins();
  return jenkins.getNodeConfig(name);
}

export async function setNodeConfig(
  runtime: ToolRuntime,
  name: string,
  configXml: string
): Promise<void> {
  const jenkins = await runtime.getJenkins();
  await jenkins.setNodeConfig(name, configXml);
}
