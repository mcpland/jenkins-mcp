import type { ToolRuntime } from "./runtime.js";
import { queueItemToOutput } from "./serializers.js";

export async function getAllQueueItems(
  runtime: ToolRuntime
): Promise<Array<Record<string, unknown>>> {
  const jenkins = await runtime.getJenkins();
  const queue = await jenkins.getQueue();
  return queue.items.map((item) => queueItemToOutput(item, false));
}

export async function getQueueItem(
  runtime: ToolRuntime,
  id: number
): Promise<Record<string, unknown>> {
  const jenkins = await runtime.getJenkins();
  const item = await jenkins.getQueueItem(id, 1);
  return queueItemToOutput(item, true);
}

export async function cancelQueueItem(runtime: ToolRuntime, id: number): Promise<void> {
  const jenkins = await runtime.getJenkins();
  await jenkins.cancelQueueItem(id);
}
