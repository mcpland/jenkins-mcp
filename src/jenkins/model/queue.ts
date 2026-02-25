export interface QueueItemTask {
  fullDisplayName?: string | undefined;
  name?: string | undefined;
  url?: string | undefined;
}

export interface QueueItem {
  id: number;
  inQueueSince: number;
  url: string;
  why: string | null;
  task: QueueItemTask;
}

export interface Queue {
  discoverableItems: unknown[];
  items: QueueItem[];
}

function parseQueueItemTask(value: unknown): QueueItemTask {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    fullDisplayName: typeof raw.fullDisplayName === "string" ? raw.fullDisplayName : undefined,
    name: typeof raw.name === "string" ? raw.name : undefined,
    url: typeof raw.url === "string" ? raw.url : undefined
  };
}

export function parseQueueItem(value: unknown): QueueItem {
  const raw = value as Record<string, unknown>;

  if (
    typeof raw.id !== "number" ||
    typeof raw.inQueueSince !== "number" ||
    typeof raw.url !== "string"
  ) {
    throw new Error("Invalid QueueItem payload.");
  }

  return {
    id: raw.id,
    inQueueSince: raw.inQueueSince,
    url: raw.url,
    why: typeof raw.why === "string" ? raw.why : null,
    task: parseQueueItemTask(raw.task)
  };
}

export function parseQueue(value: unknown): Queue {
  const raw = value as Record<string, unknown>;
  const discoverableItems = Array.isArray(raw.discoverableItems) ? raw.discoverableItems : [];
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];

  return {
    discoverableItems,
    items: itemsRaw.map(parseQueueItem)
  };
}
