export interface NodeExecutorCurrentExecutable {
  url?: string | undefined;
  timestamp?: number | undefined;
  number?: number | undefined;
  fullDisplayName?: string | undefined;
}

export interface NodeExecutor {
  currentExecutable?: NodeExecutorCurrentExecutable | undefined;
}

export interface Node {
  displayName: string;
  offline: boolean;
  executors: NodeExecutor[];
}

function parseCurrentExecutable(value: unknown): NodeExecutorCurrentExecutable {
  const raw = (value ?? {}) as Record<string, unknown>;

  return {
    url: typeof raw.url === "string" ? raw.url : undefined,
    timestamp: typeof raw.timestamp === "number" ? raw.timestamp : undefined,
    number: typeof raw.number === "number" ? raw.number : undefined,
    fullDisplayName: typeof raw.fullDisplayName === "string" ? raw.fullDisplayName : undefined
  };
}

export function parseNode(value: unknown): Node {
  const raw = value as Record<string, unknown>;

  if (typeof raw.displayName !== "string" || typeof raw.offline !== "boolean") {
    throw new Error("Invalid Node payload.");
  }

  const executorsRaw = Array.isArray(raw.executors) ? raw.executors : [];

  return {
    displayName: raw.displayName,
    offline: raw.offline,
    executors: executorsRaw.map((executorRaw) => {
      const record = executorRaw as Record<string, unknown>;
      const currentExecutableRaw = record.currentExecutable;
      return {
        currentExecutable:
          currentExecutableRaw && typeof currentExecutableRaw === "object"
            ? parseCurrentExecutable(currentExecutableRaw)
            : undefined
      };
    })
  };
}
