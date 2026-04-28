import { UserError } from "@cloudflare/workers-utils";
import { fetch } from "undici";
import { logger } from "../logger";
import type { InstanceStatusAndLogs } from "./types";

const LOCAL_EXPLORER_BASE_PATH = "/cdn-cgi/explorer/api";
const DEFAULT_LOCAL_PORT = 8787;

/**
 * Shared CLI args for --local / --port on workflow commands.
 */
export const localWorkflowArgs = {
	local: {
		type: "boolean" as const,
		describe: "Interact with local dev session",
	},
	port: {
		type: "number" as const,
		describe: "Port of the local dev session (default: 8787)",
		default: DEFAULT_LOCAL_PORT,
	},
};

// ============================================================================
// Response types matching the local explorer API envelope
// ============================================================================

interface LocalApiResponse<T> {
	success: boolean;
	errors: Array<{ code: number; message: string }>;
	messages: Array<{ code: number; message: string }>;
	result: T;
	result_info?: {
		page?: number;
		per_page?: number;
		total_count?: number;
		total_pages?: number;
		count?: number;
		status_counts?: Record<string, number>;
	};
}

// ============================================================================
// Core fetch utility
// ============================================================================

/**
 * Make a fetch request to the local dev server's explorer API, extracting the
 * `result` from the JSON response envelope.
 */
export async function fetchLocalResult<T>(
	port: number,
	path: string,
	init?: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<T> {
	const url = `http://localhost:${port}${LOCAL_EXPLORER_BASE_PATH}${path}`;

	let response;
	try {
		response = await fetch(url, {
			method: init?.method ?? "GET",
			headers: init?.headers,
			body: init?.body,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown network error";
		throw new UserError(
			`Could not connect to local dev session on port ${port}. Make sure "wrangler dev" is running.\n  ${message}`
		);
	}

	if (!response.ok) {
		const json = (await response
			.json()
			.catch(() => null)) as LocalApiResponse<T | null> | null;
		const errorMessage =
			json?.errors?.[0]?.message ?? `HTTP ${response.status}`;
		throw new UserError(`Local API error: ${errorMessage}`);
	}

	const json = (await response.json()) as LocalApiResponse<T>;

	if (!json.success) {
		const errorMessage = json.errors?.[0]?.message ?? "Unknown local API error";
		throw new UserError(`Local API error: ${errorMessage}`);
	}

	return json.result;
}

// ============================================================================
// Local workflow helpers (mirroring the remote utils)
// ============================================================================

/**
 * List all workflow instances locally and resolve "latest" to an actual ID.
 * Mirrors `getInstanceIdFromArgs` but uses the local explorer API.
 */
export async function getLocalInstanceIdFromArgs(
	port: number,
	args: { id: string; name: string }
): Promise<string> {
	let id = args.id;

	if (id === "latest") {
		const instances = await fetchLocalResult<
			Array<{ id: string; status?: string; created_on?: string }>
		>(port, `/workflows/${encodeURIComponent(args.name)}/instances`);

		if (instances.length === 0) {
			throw new UserError(`There are no instances in workflow "${args.name}"`);
		}

		// Sort by created_on descending if available, otherwise take first (already sorted by server)
		const sorted = instances.sort((a, b) =>
			(b.created_on ?? "").localeCompare(a.created_on ?? "")
		);

		id = sorted[0].id;
		logger.info(`Latest instance is "${id}"`);
	}

	return id;
}

/**
 * Change the status of a local workflow instance (pause, resume, restart, terminate).
 * The local explorer API uses `action` instead of `status` in the request body.
 */
export async function updateLocalInstanceStatus(
	port: number,
	workflowName: string,
	instanceId: string,
	action: "pause" | "resume" | "restart" | "terminate"
): Promise<void> {
	await fetchLocalResult<{ success: boolean }>(
		port,
		`/workflows/${encodeURIComponent(workflowName)}/instances/${encodeURIComponent(instanceId)}/status`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action }),
		}
	);
}

// ============================================================================
// Local response types (differ slightly from remote API types)
// ============================================================================

export interface LocalWorkflow {
	name: string;
	class_name: string;
	script_name: string;
}

export interface LocalWorkflowDetails {
	name: string;
	class_name: string;
	script_name: string;
	instances: Record<string, number>;
}

export interface LocalInstance {
	id: string;
	status?: string;
	created_on?: string;
}

export type LocalInstanceStatusAndLogs = InstanceStatusAndLogs;
