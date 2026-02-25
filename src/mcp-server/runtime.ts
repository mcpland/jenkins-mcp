import type { Jenkins } from "../jenkins/rest-client.js";

export interface ToolRuntime {
  getJenkins(): Promise<Jenkins>;
}
