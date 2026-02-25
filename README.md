# jenkins-mcp

![Node CI](https://github.com/mcpland/jenkins-mcp/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/jenkins-mcp.svg)](https://www.npmjs.com/package/jenkins-mcp)
![license](https://img.shields.io/npm/l/jenkins-mcp)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides AI assistants with full access to Jenkins CI/CD systems. Built with TypeScript and Node.js, it enables Claude, Cursor, and other MCP-compatible clients to query, manage, and control Jenkins jobs, builds, nodes, and queues through natural language.

## Table of Contents

- [Features](#features)
- [Usage](#usage)
- [Configuration](#configuration)
- [MCP Client Integration](#mcp-client-integration)
- [Available Tools](#available-tools)
- [Transport Modes](#transport-modes)
- [Architecture](#architecture)
- [Development](#development)

## Features

- **19 MCP Tools** — Full Jenkins automation: jobs, builds, nodes, and queues
- **3 Transport Modes** — `stdio`, `sse`, and `streamable-http` for different deployment scenarios
- **Read-Only Mode** — Restrict to safe, read-only operations for controlled environments
- **Per-Request Auth** — HTTP header-based Jenkins auth for multi-user/multi-tenant setups
- **SSL Configuration** — Toggle SSL certificate verification for self-signed certs
- **Session Singleton** — Reuse Jenkins client connections within a session for efficiency
- **CSRF Protection** — Automatic crumb/token handling for Jenkins security
- **Folder Support** — Full support for nested Jenkins folders and multi-branch pipelines
- **TypeScript Strict Mode** — Fully typed codebase with strict compiler checks

## Usage

### MCP Client

Add the following to your MCP client configuration file:

```json
{
  "mcpServers": {
    "jenkins": {
      "command": "npx",
      "args": [
        "jenkins-mcp",
        "--jenkins-url",
        "https://jenkins.example.com",
        "--jenkins-username",
        "your-username",
        "--jenkins-password",
        "your-api-token"
      ]
    }
  }
}
```

### Claude Code

```bash
claude mcp add jenkins -- npx jenkins-mcp \
  --jenkins-url https://jenkins.example.com \
  --jenkins-username your-username \
  --jenkins-password your-api-token
```

### Cursor

Add to your Cursor MCP settings (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "jenkins": {
      "command": "npx",
      "args": [
        "jenkins-mcp",
        "--jenkins-url",
        "https://jenkins.example.com",
        "--jenkins-username",
        "your-username",
        "--jenkins-password",
        "your-api-token"
      ]
    }
  }
}
```

### Read-Only Mode

For safety in production environments, use `--read-only` to disable all write operations:

```json
{
  "mcpServers": {
    "jenkins": {
      "command": "npx",
      "args": [
        "jenkins-mcp",
        "--read-only",
        "--jenkins-url",
        "https://jenkins.example.com",
        "--jenkins-username",
        "your-username",
        "--jenkins-password",
        "your-api-token"
      ]
    }
  }
}
```

## Configuration

Jenkins-MCP can be configured through CLI arguments, environment variables, or HTTP headers (for HTTP transports).

### CLI Options

```bash
jenkins-mcp [options]
```

| Option                                                           | Description                                           | Default   |
| ---------------------------------------------------------------- | ----------------------------------------------------- | --------- |
| `--jenkins-url`                                                  | Jenkins server URL                                    | —         |
| `--jenkins-username`                                             | Jenkins username                                      | —         |
| `--jenkins-password`                                             | Jenkins password or API token                         | —         |
| `--jenkins-timeout`                                              | API request timeout in seconds                        | `5`       |
| `--jenkins-verify-ssl` / `--no-jenkins-verify-ssl`               | Verify SSL certificates                               | `true`    |
| `--jenkins-session-singleton` / `--no-jenkins-session-singleton` | Reuse Jenkins client within session                   | `true`    |
| `--read-only`                                                    | Only register read-only tools                         | `false`   |
| `--transport`                                                    | Transport mode: `stdio` \| `sse` \| `streamable-http` | `stdio`   |
| `--host`                                                         | Host for HTTP transports                              | `0.0.0.0` |
| `--port`                                                         | Port for HTTP transports                              | `9887`    |

### Environment Variables

Jenkins-MCP reads configuration from process environment variables. It does not auto-load `.env` files by itself.

If you use a local `.env` file, load it before starting the server (for example: `set -a; source .env; set +a`), then run `jenkins-mcp`.

Example `.env` values:

```bash
# Jenkins server URL
jenkins_url=https://jenkins.example.com/

# Jenkins basic auth
jenkins_username=your-username
jenkins_password=your-api-token

# Optional runtime settings
jenkins_timeout=5
jenkins_verify_ssl=true
jenkins_session_singleton=true
```

### HTTP Headers (HTTP Transports Only)

When using `sse` or `streamable-http` transport, Jenkins credentials can be provided per-request via HTTP headers. This enables multi-user scenarios where different requests authenticate against different Jenkins instances.

| Header               | Description                   |
| -------------------- | ----------------------------- |
| `x-jenkins-url`      | Jenkins server URL            |
| `x-jenkins-username` | Jenkins username              |
| `x-jenkins-password` | Jenkins password or API token |

Each provided header overrides the corresponding environment variable for that request. Missing header values fall back to environment configuration.

## Available Tools

### Job / Item Tools

| Tool              | Description                               | Parameters                                              | Read-Only |
| ----------------- | ----------------------------------------- | ------------------------------------------------------- | --------- |
| `get_all_items`   | Get all jobs and folders from Jenkins     | —                                                       | Yes       |
| `get_item`        | Get a specific job or folder by full name | `fullname`                                              | Yes       |
| `get_item_config` | Get job configuration XML                 | `fullname`                                              | Yes       |
| `set_item_config` | Update job configuration XML              | `fullname`, `config_xml`                                | No        |
| `query_items`     | Search items with regex filters           | `class_pattern?`, `fullname_pattern?`, `color_pattern?` | Yes       |
| `build_item`      | Trigger a job build                       | `fullname`, `build_type`, `params?`                     | No        |

### Build Tools

| Tool                       | Description                        | Parameters            | Read-Only |
| -------------------------- | ---------------------------------- | --------------------- | --------- |
| `get_build`                | Get build details                  | `fullname`, `number?` | Yes       |
| `get_build_console_output` | Get full console log output        | `fullname`, `number?` | Yes       |
| `get_build_test_report`    | Get test results report            | `fullname`, `number?` | Yes       |
| `get_build_scripts`        | Extract build scripts (for replay) | `fullname`, `number?` | Yes       |
| `get_running_builds`       | Get all currently running builds   | —                     | Yes       |
| `stop_build`               | Stop a running build               | `fullname`, `number`  | No        |

### Node Tools

| Tool              | Description                            | Parameters           | Read-Only |
| ----------------- | -------------------------------------- | -------------------- | --------- |
| `get_all_nodes`   | Get all compute nodes                  | —                    | Yes       |
| `get_node`        | Get a specific node with executor info | `name`               | Yes       |
| `get_node_config` | Get node configuration XML             | `name`               | Yes       |
| `set_node_config` | Update node configuration XML          | `name`, `config_xml` | No        |

### Queue Tools

| Tool                  | Description                        | Parameters | Read-Only |
| --------------------- | ---------------------------------- | ---------- | --------- |
| `get_all_queue_items` | Get all items waiting in the queue | —          | Yes       |
| `get_queue_item`      | Get a specific queue item by ID    | `id`       | Yes       |
| `cancel_queue_item`   | Cancel a queued item               | `id`       | No        |

> Tools marked **Read-Only: No** are only available when `--read-only` is not set.

## Transport Modes

### stdio (Default)

Standard input/output transport for direct MCP client integration. This is the recommended mode for Claude Desktop, Cursor, and other desktop MCP clients.

```bash
jenkins-mcp --transport stdio \
  --jenkins-url https://jenkins.example.com \
  --jenkins-username user --jenkins-password token
```

### SSE (Server-Sent Events)

HTTP-based transport using Server-Sent Events. Suitable for web-based clients or remote access scenarios.

```bash
jenkins-mcp --transport sse \
  --host 127.0.0.1 --port 9887 \
  --jenkins-url https://jenkins.example.com \
  --jenkins-username user --jenkins-password token
```

- **SSE endpoint**: `GET /sse` — establishes an SSE connection and returns a session
- **Message endpoint**: `POST /message?sessionId=<id>` — sends messages to the session

### Streamable HTTP

Session-based HTTP MCP transport over `/mcp`. Sessions are initialized via MCP `initialize`, then correlated with `mcp-session-id` in follow-up requests.

```bash
jenkins-mcp --transport streamable-http \
  --host 127.0.0.1 --port 9887 \
  --jenkins-url https://jenkins.example.com \
  --jenkins-username user --jenkins-password token
```

- **MCP endpoint**: `POST /mcp` — handles all MCP protocol messages

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  MCP Client                     │
│          (Claude, Cursor, etc.)                 │
└──────────────────┬──────────────────────────────┘
                   │  MCP Protocol
┌──────────────────▼──────────────────────────────┐
│              Transport Layer                    │
│      stdio │ SSE │ Streamable HTTP              │
├──────────────────┬──────────────────────────────┤
│           MCP Server (mcp.ts)                   │
│     Tool registration & error handling          │
├──────────────────┬──────────────────────────────┤
│          Tool Handlers                          │
│   item.ts │ build.ts │ node.ts │ queue.ts       │
├──────────────────┬──────────────────────────────┤
│         Jenkins REST Client                     │
│    HTTP requests, auth, CSRF, timeout           │
├──────────────────┬──────────────────────────────┤
│           Jenkins Server                        │
│         (REST API endpoint)                     │
└─────────────────────────────────────────────────┘
```

**Key design patterns:**

- **Dependency Injection** — `ToolRuntime` interface enables testable tool handlers
- **Session Management** — HTTP transports map sessions to isolated runtime contexts
- **Per-Request Auth** — HTTP headers override environment config for multi-tenant use
- **Automatic CSRF** — Crumb tokens are fetched and cached transparently

## Development

### Scripts

| Command              | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `pnpm dev`           | Start in watch mode (auto-reload on changes)         |
| `pnpm build`         | Build production bundle with tsup                    |
| `pnpm test`          | Run tests with Vitest                                |
| `pnpm test:watch`    | Run tests in watch mode                              |
| `pnpm test:coverage` | Run tests with coverage report                       |
| `pnpm check`         | Run all checks: format, lint, typecheck, test, build |
| `pnpm lint`          | Run ESLint                                           |
| `pnpm format`        | Format code with Prettier                            |
| `pnpm commit`        | Interactive conventional commit with Commitizen      |
| `pnpm changeset`     | Create a changeset for release                       |

## License

[MIT](LICENSE)
