const PLACEHOLDER_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

function formatMissingFields(fields: Set<string>): string {
  const quoted = [...fields].map((field) => `'${field}'`).join(", ");
  return `{${quoted}}`;
}

export class RestEndpoint {
  readonly template: string;
  readonly fields: Set<string>;

  constructor(template: string) {
    this.template = template;
    this.fields = new Set<string>();

    for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
      const fieldName = match[1];
      if (fieldName) {
        this.fields.add(fieldName);
      }
    }
  }

  call(values: Record<string, string | number>): string {
    const missing = new Set<string>();
    for (const field of this.fields) {
      if (!(field in values)) {
        missing.add(field);
      }
    }

    if (missing.size > 0) {
      throw new Error(`Missing: ${formatMissingFields(missing)}`);
    }

    return this.template.replace(PLACEHOLDER_PATTERN, (_match, key: string) => String(values[key]));
  }
}

export const CRUMB = new RestEndpoint("crumbIssuer/api/json");

export const ITEM = new RestEndpoint("{folder}job/{name}/api/json?depth={depth}");
export const ITEMS = new RestEndpoint("{folder}/api/json?tree={query}");
export const ITEM_CONFIG = new RestEndpoint("{folder}job/{name}/config.xml");
export const ITEM_BUILD = new RestEndpoint("{folder}job/{name}/{build_type}");

export const QUEUE = new RestEndpoint("queue/api/json?depth={depth}");
export const QUEUE_ITEM = new RestEndpoint("queue/item/{id}/api/json?depth={depth}");
export const QUEUE_CANCEL_ITEM = new RestEndpoint("queue/cancelItem?id={id}");

export const NODE = new RestEndpoint("computer/{name}/api/json?depth={depth}");
export const NODES = new RestEndpoint("computer/api/json?depth={depth}");
export const NODE_CONFIG = new RestEndpoint("computer/{name}/config.xml");

export const BUILD = new RestEndpoint("{folder}job/{name}/{number}/api/json?depth={depth}");
export const BUILD_CONSOLE_OUTPUT = new RestEndpoint("{folder}job/{name}/{number}/consoleText");
export const BUILD_STOP = new RestEndpoint("{folder}job/{name}/{number}/stop");
export const BUILD_REPLAY = new RestEndpoint("{folder}job/{name}/{number}/replay");
export const BUILD_TEST_REPORT = new RestEndpoint(
  "{folder}job/{name}/{number}/testReport/api/json?depth={depth}"
);
