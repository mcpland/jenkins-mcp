# jenkins-mcp

A production-ready [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for Jenkins, built with TypeScript.

## Features

- MCP server over `stdio` transport
- Jenkins tools:
  - `list_jobs`
  - `get_job`
  - `get_build`
  - `trigger_build`
- Strong TypeScript + strict lint/test/build checks
- `pnpm` + `vitest` + `changesets` + GitHub Actions CI/release

## Requirements

- Node.js >= 20
- pnpm >= 10
- Jenkins instance with API access

## Installation

```bash
pnpm install
```

## Configuration

Copy `.env.example` to your own environment config and set:

- `JENKINS_BASE_URL` (required)
- `JENKINS_USERNAME` and `JENKINS_API_TOKEN` (optional but recommended)
- `JENKINS_TIMEOUT_MS` (optional, default `10000`)

## Run

Development:

```bash
pnpm dev
```

Build:

```bash
pnpm build
```

Run built server:

```bash
pnpm start
```

## Connect From MCP Client

Example client entry:

```json
{
  "mcpServers": {
    "jenkins": {
      "command": "node",
      "args": ["/absolute/path/to/jenkins-mcp/dist/index.js"],
      "env": {
        "JENKINS_BASE_URL": "https://jenkins.example.com",
        "JENKINS_USERNAME": "ci-user",
        "JENKINS_API_TOKEN": "your-token"
      }
    }
  }
}
```

## Scripts

- `pnpm check` - format, lint, typecheck, test, build
- `pnpm test` - run unit tests
- `pnpm test:coverage` - run tests with coverage
- `pnpm commit` - create Conventional Commits via Commitizen
- `pnpm changeset` - create release note entry
- `pnpm release` - publish package (used by CI)

## Commit Convention

This repo uses Commitizen (`cz-git`) for structured Conventional Commits.

```bash
pnpm commit
```

Use this command instead of `git commit` to generate a standardized commit message.

## Release Flow

1. Add a changeset: `pnpm changeset`
2. Merge to `main`
3. GitHub Action (`release.yml`) opens/updates release PR or publishes via Changesets
