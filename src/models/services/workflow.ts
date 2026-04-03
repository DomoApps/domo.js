import { get, post } from "./http";
import { RequestOptions } from "../interfaces/request";

/** Status values returned by the Workflows API. */
type WorkflowStatus = "IN_PROGRESS" | "CANCELED" | "COMPLETED" | "FAILED" | null;

/** A running or completed workflow instance. */
interface WorkflowInstance {
  id: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  createdBy: string;
  createdOn: string;
  updatedBy: string;
  updatedOn: string;
  status: WorkflowStatus;
}

const BASE = "/domo/workflow/v1/models";

/**
 * Start a Workflow and return the created instance.
 *
 * @param workflowAlias - The alias from your manifest.json `mapping` array.
 * @param body - Start parameters whose keys match the `aliasName` values
 *               defined in the manifest's workflow mapping.
 * @param options - Optional request options.
 * @returns The workflow instance that was started.
 *
 * @example
 * const instance = await domo.workflow.start("addNumbers", { num1: 5, num2: 10 });
 * console.log(instance.id, instance.status);
 */
function startWorkflow(
  workflowAlias: string,
  body?: Record<string, any>,
  options?: RequestOptions,
): Promise<WorkflowInstance> {
  const handle = this?.post ?? post;
  return handle(
    `${BASE}/${encodeURIComponent(workflowAlias)}/start`,
    body ?? {},
    options,
  );
}

/**
 * Get the current state of a specific Workflow instance.
 *
 * @param workflowAlias - The alias from your manifest.json.
 * @param instanceId - The UUID of the workflow instance.
 * @param options - Optional request options.
 *
 * @example
 * const instance = await domo.workflow.getInstance("addNumbers", "2052e10a-...");
 * if (instance.status === "COMPLETED") { ... }
 */
function workflowInstance(
  workflowAlias: string,
  instanceId: string,
  options?: RequestOptions,
): Promise<WorkflowInstance> {
  const handle = this?.get ?? get;
  return handle(
    `${BASE}/${encodeURIComponent(workflowAlias)}/instance/${encodeURIComponent(instanceId)}`,
    options,
  );
}

/** Workflow namespace object exposed as `domo.workflow`. */
const workflow = {
  start: startWorkflow,
  getInstance: workflowInstance,
};

export {
  workflow,
  startWorkflow,
  workflowInstance,
  WorkflowInstance,
  WorkflowStatus,
};
