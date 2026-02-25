export interface Build {
  number: number;
  url: string;
  timestamp?: number | undefined;
  duration?: number | undefined;
  estimatedDuration?: number | undefined;
  building?: boolean | undefined;
  result?: string | null | undefined;
  nextBuild?: Build | null | undefined;
  previousBuild?: Build | null | undefined;
}

export interface BuildReplay {
  scripts: string[];
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  return undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

export function parseBuild(value: unknown): Build {
  const raw = value as Record<string, unknown>;
  const number = raw.number;
  const url = raw.url;

  if (typeof number !== "number" || typeof url !== "string") {
    throw new Error("Invalid Build payload.");
  }

  return {
    number,
    url,
    timestamp: toOptionalNumber(raw.timestamp),
    duration: toOptionalNumber(raw.duration),
    estimatedDuration: toOptionalNumber(raw.estimatedDuration),
    building: toOptionalBoolean(raw.building),
    result: toOptionalString(raw.result) ?? null,
    nextBuild:
      raw.nextBuild && typeof raw.nextBuild === "object" ? parseBuild(raw.nextBuild) : null,
    previousBuild:
      raw.previousBuild && typeof raw.previousBuild === "object"
        ? parseBuild(raw.previousBuild)
        : null
  };
}

export function parseBuildReplay(value: unknown): BuildReplay {
  const raw = value as Record<string, unknown>;
  const scripts = raw.scripts;

  if (!Array.isArray(scripts) || scripts.some((script) => typeof script !== "string")) {
    throw new Error("Invalid BuildReplay payload.");
  }

  return { scripts };
}
