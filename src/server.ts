import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { JenkinsConfig } from "./config.js";
import { JenkinsApiError, JenkinsClient, type JenkinsBuildParameters } from "./jenkins-client.js";
import { getPackageVersion } from "./version.js";

function jsonResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
  };
}

function errorResult(error: unknown): CallToolResult {
  if (error instanceof JenkinsApiError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error.message,
              status: error.status,
              responseBody: error.responseBody
            },
            null,
            2
          )
        }
      ]
    };
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}

export function createJenkinsMcpServer(config: JenkinsConfig): McpServer {
  const client = new JenkinsClient(config);
  const server = new McpServer({
    name: "jenkins-mcp",
    version: getPackageVersion()
  });

  server.tool(
    "list_jobs",
    "List Jenkins jobs visible to the configured account.",
    {
      nameFilter: z.string().optional().describe("Optional case-insensitive job name filter.")
    },
    async ({ nameFilter }): Promise<CallToolResult> => {
      try {
        const jobs = await client.listJobs(nameFilter);
        return jsonResult({ count: jobs.length, jobs });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_job",
    "Get summary details for a Jenkins job.",
    {
      jobName: z
        .string()
        .min(1)
        .describe("Job name. For nested jobs use slash notation, e.g. folder/my-job.")
    },
    async ({ jobName }): Promise<CallToolResult> => {
      try {
        const job = await client.getJob(jobName);
        return jsonResult(job);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "get_build",
    "Get details for a specific Jenkins build.",
    {
      jobName: z
        .string()
        .min(1)
        .describe("Job name. For nested jobs use slash notation, e.g. folder/my-job."),
      buildNumber: z.number().int().positive().describe("Build number to fetch.")
    },
    async ({ jobName, buildNumber }): Promise<CallToolResult> => {
      try {
        const build = await client.getBuild(jobName, buildNumber);
        return jsonResult(build);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "trigger_build",
    "Trigger a Jenkins build (with optional parameters).",
    {
      jobName: z
        .string()
        .min(1)
        .describe("Job name. For nested jobs use slash notation, e.g. folder/my-job."),
      parameters: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional()
        .describe("Optional build parameters for parameterized jobs.")
    },
    async ({ jobName, parameters }): Promise<CallToolResult> => {
      try {
        const result = await client.triggerBuild(
          jobName,
          parameters as JenkinsBuildParameters | undefined
        );
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  return server;
}
