import {
	aggregateListResults,
	fetchFromPeer,
	getPeerUrlsIfAggregating,
} from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import type { AppContext } from "../common";
import type { Env } from "../explorer.worker";
import type { WorkflowsWorkflow } from "../generated";
import type { zWorkflowsListInstancesData } from "../generated/zod.gen";
import type { z } from "zod";

// ============================================================================
// Error Codes
// ============================================================================

const WORKFLOW_ERROR_NOT_FOUND = 10501;

// ============================================================================
// Types
// ============================================================================

interface DirectoryEntry {
	name: string;
	type: "file" | "directory";
	birthtimeMs: number;
}

/** Methods on a WorkflowInstance handle (from workflow.get()). */
interface WorkflowHandle {
	pause(): Promise<void>;
	resume(): Promise<void>;
	restart(): Promise<void>;
	terminate(): Promise<void>;
	sendEvent(args: { payload: unknown; type: string }): Promise<void>;
	status(): Promise<{ status: string; output?: unknown; error?: unknown }>;
}

/** RPC methods exposed by the Engine Durable Object. */
interface EngineStub {
	getInstanceMetadata(): Promise<{
		instanceId: string;
		status: number;
		createdOn: string;
	}>;
	readDetailedLogs(): Promise<
		Array<{
			id: number;
			timestamp: string;
			event: number;
			group: string | null;
			target: string | null;
			metadata: Record<string, unknown>;
		}>
	>;
}

// InstanceEvent enum values
const EVT = {
	WORKFLOW_QUEUED: 0,
	WORKFLOW_START: 1,
	WORKFLOW_SUCCESS: 2,
	WORKFLOW_FAILURE: 3,
	WORKFLOW_TERMINATED: 4,
	STEP_START: 5,
	STEP_SUCCESS: 6,
	STEP_FAILURE: 7,
	SLEEP_START: 8,
	SLEEP_COMPLETE: 9,
	ATTEMPT_START: 10,
	ATTEMPT_SUCCESS: 11,
	ATTEMPT_FAILURE: 12,
	WAIT_START: 14,
	WAIT_COMPLETE: 15,
	WAIT_TIMED_OUT: 16,
} as const;

// ---------------------------------------------------------------------------
// Status counts cache — avoids resolving ALL Engine DOs on every page load.
// Invalidated when file count changes or after 30s TTL.
// ---------------------------------------------------------------------------

interface StatusCountsCache {
	counts: Record<string, number>;
	fileCount: number;
	timestamp: number;
}

const STATUS_COUNTS_TTL_MS = 30_000;
const statusCountsCache = new Map<string, StatusCountsCache>();

async function getStatusCounts(
	workflowName: string,
	sqliteFiles: DirectoryEntry[],
	engineNamespace: DurableObjectNamespace | null
): Promise<Record<string, number>> {
	const cached = statusCountsCache.get(workflowName);
	const now = Date.now();

	// Return cached if file count matches and TTL hasn't expired
	if (
		cached &&
		cached.fileCount === sqliteFiles.length &&
		now - cached.timestamp < STATUS_COUNTS_TTL_MS
	) {
		return cached.counts;
	}

	// Resolve all statuses
	const counts: Record<string, number> = {};
	if (engineNamespace) {
		const results = await Promise.allSettled(
			sqliteFiles.map(async (entry) => {
				const hexId = entry.name.replace(/\.sqlite$/, "");
				const stubId = engineNamespace.idFromString(hexId);
				const stub = engineNamespace.get(stubId) as unknown as EngineStub;
				const metadata = await stub.getInstanceMetadata();
				return STATUS_NAMES[metadata.status] ?? "unknown";
			})
		);
		for (const result of results) {
			const statusName =
				result.status === "fulfilled" ? result.value : "unknown";
			counts[statusName] = (counts[statusName] ?? 0) + 1;
		}
	}

	statusCountsCache.set(workflowName, {
		counts,
		fileCount: sqliteFiles.length,
		timestamp: now,
	});

	return counts;
}

const STATUS_NAMES: Record<number, string> = {
	0: "queued",
	1: "running",
	2: "paused",
	3: "errored",
	4: "terminated",
	5: "complete",
	6: "waitingForPause",
	7: "waiting",
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the Engine DO namespace for a workflow.
 * Returns the raw DurableObjectNamespace, allowing direct access via
 * idFromString(). Same pattern as getDOBinding() in do.ts.
 */
function getEngineNamespace(
	env: Env,
	workflowName: string
): DurableObjectNamespace | null {
	const info = env.LOCAL_EXPLORER_BINDING_MAP.workflows[workflowName];
	if (!info) {
		return null;
	}
	return env[info.engineBinding] as DurableObjectNamespace;
}

/**
 * Get the Workflow proxy binding for a workflow.
 * Used for operations that go through the standard Workflow interface (create).
 */
function getWorkflowBinding(env: Env, workflowName: string): Workflow | null {
	const info = env.LOCAL_EXPLORER_BINDING_MAP.workflows[workflowName];
	if (!info) {
		return null;
	}
	return env[info.binding] as Workflow;
}

function getLocalWorkflows(env: Env): WorkflowsWorkflow[] {
	const workflowBindingMap = env.LOCAL_EXPLORER_BINDING_MAP.workflows;
	return Object.values(workflowBindingMap).map((info) => ({
		name: info.name,
		class_name: info.className,
		script_name: info.scriptName,
	}));
}

// Cache workflow-to-peer URL mapping (avoids N+1 peer requests)
const workflowOwnerCache = new Map<
	string,
	{ url: string | null; timestamp: number }
>();
const OWNER_CACHE_TTL_MS = 30_000;

async function findWorkflowOwner(
	c: AppContext,
	workflowName: string
): Promise<string | null> {
	const cached = workflowOwnerCache.get(workflowName);
	if (cached && Date.now() - cached.timestamp < OWNER_CACHE_TTL_MS) {
		return cached.url;
	}

	const peerUrls = await getPeerUrlsIfAggregating(c);
	if (peerUrls.length === 0) {
		return null;
	}

	const responses = await Promise.all(
		peerUrls.map(async (url) => {
			const response = await fetchFromPeer(url, "/workflows");
			if (!response?.ok) {
				return null;
			}
			const data = (await response.json()) as {
				result?: Array<{ name: string }>;
			};
			const found = data.result?.some((wf) => wf.name === workflowName);
			return found ? url : null;
		})
	);

	const owner = responses.find((url) => url !== null) ?? null;
	workflowOwnerCache.set(workflowName, { url: owner, timestamp: Date.now() });
	return owner;
}

// ============================================================================
// API Handlers
// ============================================================================

/**
 * Lists all workflows available across all connected instances.
 */
export async function listWorkflows(c: AppContext): Promise<Response> {
	const localWorkflows = getLocalWorkflows(c.env);
	const aggregatedWorkflows = await aggregateListResults(
		c,
		localWorkflows,
		"/workflows"
	);

	// Deduplicate by name — first occurrence wins (local takes priority)
	const seen = new Set<string>();
	const allWorkflows = aggregatedWorkflows.filter((wf) => {
		if (seen.has(wf.name)) {
			return false;
		}
		seen.add(wf.name);
		return true;
	});

	return c.json({
		...wrapResponse(allWorkflows),
		result_info: { count: allWorkflows.length },
	});
}

/**
 * Get details of a specific workflow, including instance status counts.
 */
export async function getWorkflowDetails(
	c: AppContext,
	workflowName: string
): Promise<Response> {
	const info = c.env.LOCAL_EXPLORER_BINDING_MAP.workflows[workflowName];

	if (!info) {
		const ownerMiniflare = await findWorkflowOwner(c, workflowName);
		if (ownerMiniflare) {
			const response = await fetchFromPeer(
				ownerMiniflare,
				`/workflows/${encodeURIComponent(workflowName)}`
			);
			if (response) {
				return response;
			}
		}

		return errorResponse(
			404,
			WORKFLOW_ERROR_NOT_FOUND,
			`Workflow '${workflowName}' not found.`
		);
	}

	// Get instance files from loopback for status counts
	let statusCounts: Record<string, number> = {
		complete: 0,
		errored: 0,
		paused: 0,
		queued: 0,
		running: 0,
		terminated: 0,
		waiting: 0,
		waitingForPause: 0,
	};

	if (c.env.MINIFLARE_LOOPBACK !== undefined) {
		const encodedName = encodeURIComponent(workflowName);
		const loopbackUrl = `http://localhost/core/workflow-storage/${encodedName}`;
		const response = await c.env.MINIFLARE_LOOPBACK.fetch(loopbackUrl);

		if (response.ok) {
			const files = (await response.json()) as DirectoryEntry[];
			const sqliteFiles = files.filter(
				(entry) =>
					entry.type === "file" &&
					entry.name.endsWith(".sqlite") &&
					entry.name !== "metadata.sqlite"
			);

			const engineNamespace = getEngineNamespace(c.env, workflowName);
			const counts = await getStatusCounts(
				workflowName,
				sqliteFiles,
				engineNamespace
			);
			statusCounts = { ...statusCounts, ...counts };
		}
	}

	return c.json(
		wrapResponse({
			name: info.name,
			class_name: info.className,
			script_name: info.scriptName,
			instances: statusCounts,
		})
	);
}

/**
 * Delete all instances of a workflow by removing all .sqlite files
 * from the persistence directory via the loopback.
 */
export async function deleteWorkflow(
	c: AppContext,
	workflowName: string
): Promise<Response> {
	const info = c.env.LOCAL_EXPLORER_BINDING_MAP.workflows[workflowName];

	if (!info) {
		return errorResponse(
			404,
			WORKFLOW_ERROR_NOT_FOUND,
			`Workflow '${workflowName}' not found.`
		);
	}

	if (c.env.MINIFLARE_LOOPBACK === undefined) {
		return errorResponse(500, 10001, "Loopback service not available");
	}

	const encodedName = encodeURIComponent(workflowName);
	const loopbackUrl = `http://localhost/core/workflow-storage/${encodedName}`;

	await c.env.MINIFLARE_LOOPBACK.fetch(loopbackUrl, { method: "DELETE" });

	statusCountsCache.delete(workflowName);

	return c.json(wrapResponse({ status: "ok", success: true }));
}

type ListInstancesQuery = NonNullable<
	z.output<typeof zWorkflowsListInstancesData>["query"]
>;

/**
 * Lists instances of a workflow with server-side pagination.
 *
 * Sorting uses birthtimeMs from the filesystem (cheap, no DO wakeup).
 * Only the current page's instances are resolved via Engine DO for metadata.
 */
export async function listWorkflowInstances(
	c: AppContext,
	workflowName: string,
	query: ListInstancesQuery
): Promise<Response> {
	const { page = 1, per_page: perPage = 25, status: statusFilter } = query;

	const workflowExists =
		c.env.LOCAL_EXPLORER_BINDING_MAP.workflows[workflowName];

	if (workflowExists) {
		return executeListWorkflowInstances(c, workflowName, {
			page,
			perPage,
			statusFilter,
		});
	}

	const ownerMiniflare = await findWorkflowOwner(c, workflowName);
	if (ownerMiniflare) {
		const params = new URLSearchParams();
		params.set("page", String(page));
		params.set("per_page", String(perPage));
		if (statusFilter) {
			params.set("status", statusFilter);
		}
		const peerPath = `/workflows/${encodeURIComponent(workflowName)}/instances?${params.toString()}`;
		const response = await fetchFromPeer(ownerMiniflare, peerPath);
		if (response) {
			return response;
		}
	}

	return errorResponse(
		404,
		WORKFLOW_ERROR_NOT_FOUND,
		`Workflow '${workflowName}' not found.`
	);
}

/**
 * List workflow instances with server-side pagination.
 *
 * 1. Loopback returns all .sqlite files with birthtimeMs (cheap fs.stat)
 * 2. Sort by birthtimeMs descending (newest first) — no DO wakeup needed
 * 3. Slice to the requested page
 * 4. Resolve metadata (ID, status, createdOn) only for that page via Engine DO
 */
async function executeListWorkflowInstances(
	c: AppContext,
	workflowName: string,
	options: { page: number; perPage: number; statusFilter?: string }
): Promise<Response> {
	const { page, perPage, statusFilter } = options;

	if (c.env.MINIFLARE_LOOPBACK === undefined) {
		return errorResponse(500, 10001, "Loopback service not available");
	}

	const encodedName = encodeURIComponent(workflowName);
	const loopbackUrl = `http://localhost/core/workflow-storage/${encodedName}`;
	const response = await c.env.MINIFLARE_LOOPBACK.fetch(loopbackUrl);

	if (!response.ok) {
		if (response.status === 404) {
			return c.json({
				...wrapResponse([]),
				result_info: {
					page: 1,
					per_page: perPage,
					total_count: 0,
					total_pages: 0,
				},
			});
		}
		return errorResponse(
			500,
			10001,
			`Failed to read workflow storage: ${response.statusText}`
		);
	}

	const files = (await response.json()) as DirectoryEntry[];

	// Filter to .sqlite files, sort by file creation time (newest first)
	const sqliteFiles = files
		.filter(
			(entry) =>
				entry.type === "file" &&
				entry.name.endsWith(".sqlite") &&
				entry.name !== "metadata.sqlite"
		)
		.sort((a, b) => b.birthtimeMs - a.birthtimeMs);

	const engineNamespace = getEngineNamespace(c.env, workflowName);

	// Get cached status counts (resolves all DOs only on first load or after TTL/file count change)
	const statusCounts = await getStatusCounts(
		workflowName,
		sqliteFiles,
		engineNamespace
	);

	// Helper to resolve a single file's metadata
	async function resolveInstance(entry: DirectoryEntry) {
		const hexId = entry.name.replace(/\.sqlite$/, "");
		if (!engineNamespace) {
			return {
				id: hexId,
				status: undefined as string | undefined,
				created_on: undefined as string | undefined,
			};
		}
		try {
			const stubId = engineNamespace.idFromString(hexId);
			const stub = engineNamespace.get(stubId) as unknown as EngineStub;
			const metadata = await stub.getInstanceMetadata();
			return {
				id: metadata.instanceId || hexId,
				status:
					(STATUS_NAMES[metadata.status] as string | undefined) ?? "unknown",
				created_on: metadata.createdOn || undefined,
			};
		} catch {
			return { id: hexId, status: undefined, created_on: undefined };
		}
	}

	let instances: Array<{ id: string; status?: string; created_on?: string }>;
	let totalCount: number;

	if (statusFilter) {
		// Status filter requires resolving ALL instances to filter server-side
		const allResolved = await Promise.all(sqliteFiles.map(resolveInstance));
		const filtered = allResolved.filter((inst) => inst.status === statusFilter);
		totalCount = filtered.length;
		const offset = (page - 1) * perPage;
		instances = filtered.slice(offset, offset + perPage);
	} else {
		// No filter — only resolve the current page (efficient)
		totalCount = sqliteFiles.length;
		const offset = (page - 1) * perPage;
		const pageFiles = sqliteFiles.slice(offset, offset + perPage);
		instances = await Promise.all(pageFiles.map(resolveInstance));
	}

	const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

	// Clean undefined fields from response
	const cleanInstances = instances.map(({ id, status, created_on }) => ({
		id,
		...(status !== undefined ? { status } : {}),
		...(created_on ? { created_on } : {}),
	}));

	return c.json({
		...wrapResponse(cleanInstances),
		result_info: {
			page,
			per_page: perPage,
			total_count: totalCount,
			total_pages: totalPages,
			status_counts: statusCounts,
		},
	});
}

/**
 * Get detailed status of a specific workflow instance.
 *
 * The instanceId is the Engine DO hex ID. Uses the Engine DO namespace
 * with idFromString() to address the existing DO, then calls
 * getInstanceMetadata() and readLogs() via RPC.
 *
 * Safe because the Engine DO has no alarms and its constructor is
 * idempotent (CREATE TABLE IF NOT EXISTS).
 */
export async function getWorkflowInstanceDetails(
	c: AppContext,
	workflowName: string,
	instanceId: string
): Promise<Response> {
	const engineNamespace = getEngineNamespace(c.env, workflowName);

	if (engineNamespace) {
		return executeGetInstanceDetails(engineNamespace, instanceId, c);
	}

	const ownerMiniflare = await findWorkflowOwner(c, workflowName);
	if (ownerMiniflare) {
		const response = await fetchFromPeer(
			ownerMiniflare,
			`/workflows/${encodeURIComponent(workflowName)}/instances/${encodeURIComponent(instanceId)}`
		);
		if (response) {
			return response;
		}
	}

	return errorResponse(
		404,
		WORKFLOW_ERROR_NOT_FOUND,
		`Workflow '${workflowName}' not found.`
	);
}

/**
 * Get instance details via the Engine DO directly.
 *
 * Accepts either a real instance ID or a hex DO ID:
 * - Real instance ID (e.g. "my-instance"): uses idFromName() — same mapping
 *   the workflow engine used to create the DO.
 * - Hex DO ID (64-char hex string): uses idFromString() for direct access.
 */
async function executeGetInstanceDetails(
	engineNamespace: DurableObjectNamespace,
	instanceId: string,
	c: AppContext
): Promise<Response> {
	try {
		const isHexId = /^[0-9a-f]{64}$/i.test(instanceId);
		const stubId = isHexId
			? engineNamespace.idFromString(instanceId)
			: engineNamespace.idFromName(instanceId);
		const stub = engineNamespace.get(stubId) as unknown as EngineStub;

		const metadata = await stub.getInstanceMetadata();

		if (!metadata.instanceId) {
			return errorResponse(
				404,
				WORKFLOW_ERROR_NOT_FOUND,
				`Workflow instance '${instanceId}' not found.`
			);
		}

		const logs = await stub.readDetailedLogs();

		// Extract workflow-level events
		const queuedLog = logs.find((l) => l.event === EVT.WORKFLOW_QUEUED);
		const startLog = logs.find((l) => l.event === EVT.WORKFLOW_START);
		const successLog = logs.find((l) => l.event === EVT.WORKFLOW_SUCCESS);
		const failureLog = logs.find((l) => l.event === EVT.WORKFLOW_FAILURE);
		const terminatedLog = logs.find((l) => l.event === EVT.WORKFLOW_TERMINATED);

		const endLog = successLog ?? failureLog ?? terminatedLog;

		// Reconstruct steps grouped by groupKey
		const stepGroups = new Map<string, typeof logs>();
		for (const log of logs) {
			if (log.group) {
				const group = stepGroups.get(log.group) ?? [];
				group.push(log);
				stepGroups.set(log.group, group);
			}
		}

		const steps: Array<Record<string, unknown>> = [];
		for (const [, groupLogs] of stepGroups) {
			const firstLog = groupLogs[0];
			// Strip the trailing "-{count}" suffix from target for the step name
			const rawTarget = firstLog.target ?? "";
			const name = rawTarget.replace(/-\d+$/, "");

			const stepStart = groupLogs.find((l) => l.event === EVT.STEP_START);
			const stepSuccess = groupLogs.find((l) => l.event === EVT.STEP_SUCCESS);
			const stepFailure = groupLogs.find((l) => l.event === EVT.STEP_FAILURE);
			const sleepStart = groupLogs.find((l) => l.event === EVT.SLEEP_START);
			const sleepComplete = groupLogs.find(
				(l) => l.event === EVT.SLEEP_COMPLETE
			);
			const waitStart = groupLogs.find((l) => l.event === EVT.WAIT_START);
			const waitComplete = groupLogs.find((l) => l.event === EVT.WAIT_COMPLETE);
			const waitTimedOut = groupLogs.find(
				(l) => l.event === EVT.WAIT_TIMED_OUT
			);

			if (sleepStart) {
				// Sleep step
				steps.push({
					name,
					start: sleepStart.timestamp,
					end: sleepComplete?.timestamp ?? null,
					finished: !!sleepComplete,
					type: "sleep",
					error: null,
				});
			} else if (waitStart) {
				// WaitForEvent step
				const waitEnd = waitComplete ?? waitTimedOut;
				// WAIT_TIMED_OUT metadata is { name, message } directly
				const waitError = waitTimedOut?.metadata as
					| { name?: string; message?: string }
					| undefined;
				// WAIT_COMPLETE metadata is { timestamp, payload, type }
				const waitMeta = waitComplete?.metadata as
					| { timestamp?: string; payload?: unknown; type?: string }
					| undefined;
				steps.push({
					name,
					start: waitStart.timestamp,
					end: waitEnd?.timestamp ?? null,
					finished: !!waitEnd,
					type: "waitForEvent",
					error: waitError
						? {
								name: waitError.name ?? "Error",
								message: waitError.message ?? "",
							}
						: null,
					output: waitComplete
						? {
								type: waitMeta?.type ?? "",
								payload: waitMeta?.payload ?? {},
								timestamp: waitMeta?.timestamp ?? null,
							}
						: null,
				});
			} else if (stepStart) {
				// Regular step (step.do) with attempts
				const attempts: Array<Record<string, unknown>> = [];
				const attemptStarts = groupLogs.filter(
					(l) => l.event === EVT.ATTEMPT_START
				);
				const attemptSuccesses = groupLogs.filter(
					(l) => l.event === EVT.ATTEMPT_SUCCESS
				);
				const attemptFailures = groupLogs.filter(
					(l) => l.event === EVT.ATTEMPT_FAILURE
				);

				for (const aStart of attemptStarts) {
					const attemptNum = (aStart.metadata as Record<string, unknown>)
						.attempt as number;
					const aSuccess = attemptSuccesses.find(
						(l) =>
							(l.metadata as Record<string, unknown>).attempt === attemptNum
					);
					const aFailure = attemptFailures.find(
						(l) =>
							(l.metadata as Record<string, unknown>).attempt === attemptNum
					);
					const aEnd = aSuccess ?? aFailure;

					attempts.push({
						start: aStart.timestamp,
						end: aEnd?.timestamp ?? null,
						success: aSuccess ? true : aFailure ? false : null,
						error: aFailure
							? ((aFailure.metadata as Record<string, unknown>).error ?? null)
							: null,
					});
				}

				const stepEnd = stepSuccess ?? stepFailure;
				steps.push({
					name,
					start: stepStart.timestamp,
					end: stepEnd?.timestamp ?? null,
					success: stepSuccess ? true : stepFailure ? false : null,
					type: "step",
					output: stepSuccess?.metadata?.result ?? undefined,
					config: stepStart.metadata?.config ?? null,
					attempts,
				});
			}
		}

		return c.json(
			wrapResponse({
				status: STATUS_NAMES[metadata.status] ?? "unknown",
				params: queuedLog?.metadata?.params ?? null,
				queued: queuedLog?.timestamp ?? null,
				start: startLog?.timestamp ?? null,
				end: endLog?.timestamp ?? null,
				output: successLog?.metadata?.result ?? null,
				error: failureLog
					? ((failureLog.metadata as Record<string, unknown>).error ?? null)
					: null,
				steps,
				step_count: steps.length,
			})
		);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Instance not found";

		if (
			message === "instance.not_found" ||
			message === "Engine was never started"
		) {
			return errorResponse(
				404,
				WORKFLOW_ERROR_NOT_FOUND,
				`Workflow instance '${instanceId}' not found.`
			);
		}

		return errorResponse(500, 10001, message);
	}
}

/**
 * Create a new workflow instance.
 *
 * Uses the Workflow proxy binding to call workflow.create(), which is
 * part of the standard Workflow interface. Accepts an optional instance
 * ID and optional params payload.
 */
export async function createWorkflowInstance(
	c: AppContext,
	workflowName: string
): Promise<Response> {
	const workflow = getWorkflowBinding(c.env, workflowName);

	if (!workflow) {
		// Try peer
		const ownerMiniflare = await findWorkflowOwner(c, workflowName);
		if (ownerMiniflare) {
			const response = await fetchFromPeer(
				ownerMiniflare,
				`/workflows/${encodeURIComponent(workflowName)}/instances`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: await c.req.text(),
				}
			);
			if (response) {
				return response;
			}
		}

		return errorResponse(
			404,
			WORKFLOW_ERROR_NOT_FOUND,
			`Workflow '${workflowName}' not found.`
		);
	}

	try {
		let body: { id?: string; params?: unknown } = {};
		try {
			body = await c.req.json();
		} catch {
			// Empty body is fine — id and params are optional
		}

		const result = await workflow.create({
			id: body.id,
			params: body.params,
		});

		statusCountsCache.delete(workflowName);
		return c.json(wrapResponse({ id: result.id }));
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to create instance";
		return errorResponse(500, 10001, message);
	}
}

/**
 * Change the status of a workflow instance (pause, resume, restart, terminate).
 *
 * Uses the Workflow proxy binding to call the corresponding method on the
 * WorkflowHandle, which is part of the standard Workflow interface.
 */
export async function changeWorkflowInstanceStatus(
	c: AppContext,
	workflowName: string,
	instanceId: string
): Promise<Response> {
	const workflow = getWorkflowBinding(c.env, workflowName);

	if (!workflow) {
		const ownerMiniflare = await findWorkflowOwner(c, workflowName);
		if (ownerMiniflare) {
			const response = await fetchFromPeer(
				ownerMiniflare,
				`/workflows/${encodeURIComponent(workflowName)}/instances/${encodeURIComponent(instanceId)}/status`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: await c.req.text(),
				}
			);
			if (response) {
				return response;
			}
		}

		return errorResponse(
			404,
			WORKFLOW_ERROR_NOT_FOUND,
			`Workflow '${workflowName}' not found.`
		);
	}

	try {
		const body = (await c.req.json()) as { action: string };
		const { action } = body;

		if (!["pause", "resume", "restart", "terminate"].includes(action)) {
			return errorResponse(
				400,
				10001,
				`Invalid action '${action}'. Must be one of: pause, resume, restart, terminate.`
			);
		}

		const handle = await workflow.get(instanceId);

		switch (action) {
			case "pause":
				await handle.pause();
				break;
			case "resume":
				await handle.resume();
				break;
			case "restart":
				await handle.restart();
				break;
			case "terminate":
				await handle.terminate();
				break;
		}

		statusCountsCache.delete(workflowName);
		return c.json(wrapResponse({ success: true }));
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to change status";

		if (message === "instance.not_found") {
			return errorResponse(
				404,
				WORKFLOW_ERROR_NOT_FOUND,
				`Workflow instance '${instanceId}' not found.`
			);
		}

		return errorResponse(500, 10001, message);
	}
}

/**
 * Delete a workflow instance by removing its .sqlite persistence files.
 *
 * Converts the instance ID to a hex DO ID via idFromName(), then calls the
 * loopback to delete the .sqlite (and -shm/-wal) files from disk.
 */
export async function deleteWorkflowInstance(
	c: AppContext,
	workflowName: string,
	instanceId: string
): Promise<Response> {
	const engineNamespace = getEngineNamespace(c.env, workflowName);

	if (!engineNamespace) {
		const ownerMiniflare = await findWorkflowOwner(c, workflowName);
		if (ownerMiniflare) {
			const response = await fetchFromPeer(
				ownerMiniflare,
				`/workflows/${encodeURIComponent(workflowName)}/instances/${encodeURIComponent(instanceId)}`,
				{ method: "DELETE" }
			);
			if (response) {
				return response;
			}
		}

		return errorResponse(
			404,
			WORKFLOW_ERROR_NOT_FOUND,
			`Workflow '${workflowName}' not found.`
		);
	}

	if (c.env.MINIFLARE_LOOPBACK === undefined) {
		return errorResponse(500, 10001, "Loopback service not available");
	}

	// Convert instance ID to hex DO ID.
	// If it's already a 64-char hex string, use it directly.
	// Otherwise, use idFromName() which is how the engine created the DO.
	const isHexId = /^[0-9a-f]{64}$/i.test(instanceId);
	const hexId = isHexId
		? instanceId
		: engineNamespace.idFromName(instanceId).toString();

	const encodedName = encodeURIComponent(workflowName);
	const encodedHexId = encodeURIComponent(hexId);
	const loopbackUrl = `http://localhost/core/workflow-storage/${encodedName}/${encodedHexId}`;

	const response = await c.env.MINIFLARE_LOOPBACK.fetch(loopbackUrl, {
		method: "DELETE",
	});

	if (!response.ok) {
		if (response.status === 404) {
			return errorResponse(
				404,
				WORKFLOW_ERROR_NOT_FOUND,
				`Workflow instance '${instanceId}' not found.`
			);
		}
		return errorResponse(500, 10001, "Failed to delete instance");
	}

	statusCountsCache.delete(workflowName);
	return c.json(wrapResponse({ success: true }));
}

/**
 * Send an event to a workflow instance.
 *
 * Uses the Workflow proxy binding to call handle.sendEvent({ type, payload }).
 */
export async function sendWorkflowInstanceEvent(
	c: AppContext,
	workflowName: string,
	instanceId: string,
	eventType: string
): Promise<Response> {
	const workflow = getWorkflowBinding(c.env, workflowName);

	if (!workflow) {
		const ownerMiniflare = await findWorkflowOwner(c, workflowName);
		if (ownerMiniflare) {
			const response = await fetchFromPeer(
				ownerMiniflare,
				`/workflows/${encodeURIComponent(workflowName)}/instances/${encodeURIComponent(instanceId)}/events/${encodeURIComponent(eventType)}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: await c.req.text(),
				}
			);
			if (response) {
				return response;
			}
		}

		return errorResponse(
			404,
			WORKFLOW_ERROR_NOT_FOUND,
			`Workflow '${workflowName}' not found.`
		);
	}

	try {
		let payload: unknown = undefined;
		try {
			payload = await c.req.json();
		} catch {
			// Empty body is fine — payload is optional
		}

		const handle = (await workflow.get(
			instanceId
		)) as unknown as WorkflowHandle;
		await handle.sendEvent({ payload, type: eventType });

		return c.json(wrapResponse({ success: true }));
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to send event";

		if (message === "instance.not_found") {
			return errorResponse(
				404,
				WORKFLOW_ERROR_NOT_FOUND,
				`Workflow instance '${instanceId}' not found.`
			);
		}

		return errorResponse(500, 10001, message);
	}
}
