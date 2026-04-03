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

/** Per-instance metric inside a metrics response. */
interface WorkflowInstanceMetric {
  instanceId: string;
  modelId: string;
  version: string;
  creatorId: string;
  workflowStartTime: string;
  workflowEndTime: string | null;
  workflowCancelTime: string | null;
  workflowCycleTime: number;
  status: WorkflowStatus;
}

/** Aggregate metrics for a workflow model. */
interface WorkflowMetrics {
  modelId: string;
  version: string;
  completedWorkflows: number;
  inProgressWorkflows: number;
  failedWorkflows: number;
  canceledWorkflows: number;
  averageCycleTime: number;
  instanceMetric: WorkflowInstanceMetric[];
}

/** Query parameters for {@link workflowMetrics}. */
interface WorkflowMetricsParams {
  limit?: number;
  offset?: number;
  after?: number;
  until?: number;
  status?: "IN_PROGRESS" | "CANCELED" | "COMPLETED";
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
 * Get aggregate metrics and instance history for a Workflow.
 *
 * @param workflowAlias - The alias from your manifest.json.
 * @param params - Optional query filters (limit, offset, after, until, status).
 * @param options - Optional request options.
 *
 * @example
 * const metrics = await domo.workflow.metrics("addNumbers", { status: "COMPLETED", limit: 10 });
 * console.log(metrics.completedWorkflows);
 */
function workflowMetrics(
  workflowAlias: string,
  params?: WorkflowMetricsParams,
  options?: RequestOptions,
): Promise<WorkflowMetrics> {
  const handle = this?.get ?? get;
  let url = `${BASE}/${encodeURIComponent(workflowAlias)}/overall`;

  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.set(k, String(v));
    }
    const str = qs.toString();
    if (str) url += `?${str}`;
  }

  return handle(url, options);
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
  metrics: workflowMetrics,
  getInstance: workflowInstance,
};

export {
  workflow,
  startWorkflow,
  workflowMetrics,
  workflowInstance,
  WorkflowInstance,
  WorkflowMetrics,
  WorkflowMetricsParams,
  WorkflowInstanceMetric,
  WorkflowStatus,
};
