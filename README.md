# jenkins-mcp

TypeScript + Node.js implementation of the MCP Jenkins server, functionally ported from `mcp-jenkins-py`.

## Features

- Full Jenkins MCP toolset parity with Python implementation
- Transport modes:
  - `stdio`
  - `sse`
  - `streamable-http`
- Header-based Jenkins auth for HTTP transports:
  - `x-jenkins-url`
  - `x-jenkins-username`
  - `x-jenkins-password`
- Read-only mode support
- Session singleton mode for Jenkins client reuse
- TypeScript strict type checks, Vitest coverage, Changesets release flow

## Installation

```bash
pnpm install
```

## CLI Options

```bash
pnpm start -- [options]
```

| Option                                                           | Description                          | Default   |
| ---------------------------------------------------------------- | ------------------------------------ | --------- |
| `--jenkins-url`                                                  | Jenkins URL                          | -         |
| `--jenkins-username`                                             | Jenkins username                     | -         |
| `--jenkins-password`                                             | Jenkins password or API token        | -         |
| `--jenkins-timeout`                                              | Jenkins API timeout in seconds       | `5`       |
| `--jenkins-verify-ssl` / `--no-jenkins-verify-ssl`               | Verify Jenkins SSL cert              | `true`    |
| `--jenkins-session-singleton` / `--no-jenkins-session-singleton` | Reuse Jenkins client in same session | `true`    |
| `--read-only`                                                    | Register read tools only             | `false`   |
| `--tool-regex`                                                   | Deprecated option (kept for parity)  | `""`      |
| `--transport`                                                    | `stdio` / `sse` / `streamable-http`  | `stdio`   |
| `--host`                                                         | Host for HTTP transports             | `0.0.0.0` |
| `--port`                                                         | Port for HTTP transports             | `9887`    |

## Environment Variables

Use `.env.example` as reference:

- `jenkins_url`
- `jenkins_username`
- `jenkins_password`
- `jenkins_timeout`
- `jenkins_verify_ssl`
- `jenkins_session_singleton`

## Available Tools

- `get_item`
- `get_item_config`
- `set_item_config`
- `get_all_items`
- `query_items`
- `build_item`
- `get_all_nodes`
- `get_node`
- `get_node_config`
- `set_node_config`
- `get_all_queue_items`
- `get_queue_item`
- `cancel_queue_item`
- `get_build`
- `get_build_scripts`
- `get_build_console_output`
- `get_build_test_report`
- `get_running_builds`
- `stop_build`

## Examples

Stdio:

```bash
pnpm start -- --transport stdio --jenkins-url https://jenkins.example.com --jenkins-username username --jenkins-password token
```

SSE:

```bash
pnpm start -- --transport sse --host 127.0.0.1 --port 9887 --jenkins-url https://jenkins.example.com --jenkins-username username --jenkins-password token
```

Streamable HTTP:

```bash
pnpm start -- --transport streamable-http --host 127.0.0.1 --port 9887 --jenkins-url https://jenkins.example.com --jenkins-username username --jenkins-password token
```

## Development

- `pnpm check` - format, lint, typecheck, test, build
- `pnpm test` - run tests
- `pnpm commit` - interactive conventional commit with Commitizen
- `pnpm changeset` - create changeset

## License

MIT
