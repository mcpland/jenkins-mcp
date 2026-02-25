const DEFAULT_TIMEOUT_MS = 10_000;

export interface JenkinsConfig {
  baseUrl: URL;
  username?: string;
  apiToken?: string;
  timeoutMs: number;
}

function parseTimeout(rawValue: string | undefined): number {
  if (rawValue === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("JENKINS_TIMEOUT_MS must be a positive integer.");
  }

  return parsed;
}

function normalizeBaseUrl(baseUrl: URL): URL {
  const normalized = new URL(baseUrl.toString());
  if (!normalized.pathname.endsWith("/")) {
    normalized.pathname = `${normalized.pathname}/`;
  }
  return normalized;
}

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): JenkinsConfig {
  const baseUrlRaw = env.JENKINS_BASE_URL?.trim();
  if (!baseUrlRaw) {
    throw new Error("JENKINS_BASE_URL is required.");
  }

  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = normalizeBaseUrl(new URL(baseUrlRaw));
  } catch {
    throw new Error("JENKINS_BASE_URL must be a valid URL.");
  }

  const username = env.JENKINS_USERNAME?.trim();
  const apiToken = env.JENKINS_API_TOKEN?.trim();

  if ((username && !apiToken) || (!username && apiToken)) {
    throw new Error("Set both JENKINS_USERNAME and JENKINS_API_TOKEN, or leave both unset.");
  }

  const config: JenkinsConfig = {
    baseUrl: parsedBaseUrl,
    timeoutMs: parseTimeout(env.JENKINS_TIMEOUT_MS)
  };

  if (username && apiToken) {
    config.username = username;
    config.apiToken = apiToken;
  }

  return config;
}
