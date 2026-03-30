import { dim, green, red } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { ApiError, ApplicationsService } from "@cloudflare/containers-shared";
import { JsonFriendlyFatalError, UserError } from "@cloudflare/workers-utils";
import { fillOpenAPIConfiguration } from "../cloudchamber/common";
import { createCommand } from "../core/create-command";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { onKeyPress } from "../utils/onKeyPress";
import { containersScope } from "./index";
import type { HandlerArgs, NamedArgDefinitions } from "../core/types";
import type {
	DashApplicationDurableObjectInstance,
	DashApplicationInstance,
	DashApplicationInstances,
} from "@cloudflare/containers-shared";

type InstanceState =
	| "provisioning"
	| "running"
	| "failed"
	| "stopping"
	| "stopped"
	| "unhealthy"
	| "inactive"
	| "unknown";

function deriveInstanceState(instance: DashApplicationInstance): InstanceState {
	const status = instance.current_placement?.status;
	if (!status) {
		return "unknown";
	}

	const raw = status.container_status ?? status.health;
	switch (raw) {
		case "placed":
			return "provisioning";
		case "running":
		case "failed":
		case "stopping":
		case "stopped":
		case "unhealthy":
			return raw;
		default:
			return "unknown";
	}
}

function colorState(state: InstanceState): string {
	switch (state) {
		case "running":
			return green(state);
		case "failed":
		case "unhealthy":
		case "stopped":
		case "stopping":
			return red(state);
		default:
			return state;
	}
}

type InstanceRow = {
	instance?: DashApplicationInstance;
	durableObject?: DashApplicationDurableObjectInstance;
};

/**
 * Join instances with durable_objects data. When DO data is present,
 * DOs are correlated to instances via deployment_id. DOs without a
 * matching running instance are included with state "inactive".
 */
function buildInstanceRows(data: DashApplicationInstances): InstanceRow[] {
	const doList = data.durable_objects ?? [];

	if (doList.length === 0) {
		// Non-DO application: just return raw instances
		return data.instances.map((instance) => ({ instance }));
	}

	// Build a map from deployment_id -> instance for fast lookup
	const instanceByDeploymentId = new Map<string, DashApplicationInstance>();
	for (const inst of data.instances) {
		instanceByDeploymentId.set(inst.id, inst);
	}

	// Each DO is a row; join with matching instance if one exists
	return doList.map((doInst) => ({
		instance: doInst.deployment_id
			? instanceByDeploymentId.get(doInst.deployment_id)
			: undefined,
		durableObject: doInst,
	}));
}

async function fetchPage(
	applicationId: string,
	perPage?: number,
	pageToken?: string
): Promise<{
	data: DashApplicationInstances;
	nextPageToken?: string;
}> {
	try {
		const page = await ApplicationsService.listDashApplicationInstances(
			applicationId,
			perPage,
			pageToken
		);
		return {
			data: page.data,
			nextPageToken: page.resultInfo?.next_page_token,
		};
	} catch (err) {
		if (!(err instanceof Error)) {
			throw err;
		}

		if (err instanceof ApiError) {
			if (err.status === 400 || err.status === 404) {
				throw new UserError(
					`There has been an error fetching instances.\n${err.body.error}\nUse \`wrangler containers list\` to view your containers and corresponding IDs.`
				);
			}

			throw new Error(
				`There has been an unknown error fetching instances.\n${JSON.stringify(err.body)}`
			);
		}

		throw new Error(
			`There has been an internal error fetching instances.\n${err.message}`
		);
	}
}

function rowsToJsonOutput(rows: InstanceRow[]): Record<string, unknown>[] {
	const hasDurableObjects = rows.some((r) => r.durableObject);

	if (hasDurableObjects) {
		return rows.map((row) => {
			const state = row.instance
				? deriveInstanceState(row.instance)
				: "inactive";
			return {
				id: row.durableObject?.id ?? row.instance?.id ?? null,
				name: row.durableObject?.name ?? null,
				state,
				location: row.instance?.location ?? null,
				version: row.instance?.app_version ?? null,
				created:
					row.instance?.created_at ?? row.durableObject?.assigned_at ?? null,
			};
		});
	}

	return rows.map((row) => {
		const state = row.instance ? deriveInstanceState(row.instance) : "unknown";
		return {
			id: row.instance?.id ?? null,
			state,
			location: row.instance?.location ?? null,
			version: row.instance?.app_version ?? null,
			created: row.instance?.created_at ?? null,
		};
	});
}

function renderTable(rows: InstanceRow[]): void {
	const hasDurableObjects = rows.some((r) => r.durableObject);

	if (hasDurableObjects) {
		logger.table(
			rows.map((row) => {
				const state = row.instance
					? deriveInstanceState(row.instance)
					: "inactive";
				return {
					INSTANCE: row.durableObject?.id ?? row.instance?.id ?? "-",
					NAME: row.durableObject?.name ?? "-",
					STATE: colorState(state),
					LOCATION: row.instance?.location ?? "-",
					VERSION: row.instance ? String(row.instance.app_version) : "-",
					CREATED:
						row.instance?.created_at ?? row.durableObject?.assigned_at ?? "-",
				};
			})
		);
	} else {
		logger.table(
			rows.map((row) => {
				const state = row.instance
					? deriveInstanceState(row.instance)
					: "unknown";
				return {
					INSTANCE: row.instance?.id ?? "-",
					STATE: colorState(state),
					LOCATION: row.instance?.location ?? "-",
					VERSION: row.instance ? String(row.instance.app_version) : "-",
					CREATED: row.instance?.created_at ?? "-",
				};
			})
		);
	}
}

const instancesArgs = {
	ID: {
		describe: "ID of the application to list instances for",
		type: "string",
		demandOption: true,
	},
	"per-page": {
		describe: "Number of instances per page",
		type: "number",
		default: 25,
		coerce: (val: number) => {
			if (val < 1) {
				throw new UserError("--per-page must be at least 1");
			}
			return val;
		},
	},
	json: {
		describe: "Return output as JSON",
		type: "boolean",
		default: false,
	},
} as const satisfies NamedArgDefinitions;

type InstancesArgs = HandlerArgs<typeof instancesArgs>;

export async function instancesCommand(args: InstancesArgs): Promise<void> {
	const uuidRegex =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!uuidRegex.test(args.ID)) {
		throw new UserError(
			`Expected an application ID but got ${args.ID}. Use \`wrangler containers list\` to view your containers and corresponding IDs.`
		);
	}

	// --json: output JSON and exit
	if (args.json) {
		try {
			const { data } = await fetchPage(args.ID);
			const rows = buildInstanceRows(data);
			logger.json(rowsToJsonOutput(rows));
			return;
		} catch (err) {
			if (err instanceof UserError) {
				throw err;
			}
			const message = err instanceof Error ? err.message : "Unknown error";
			throw new JsonFriendlyFatalError(JSON.stringify({ error: message }));
		}
	}

	// Non-interactive: fetch all results, render a single table, no pagination
	if (isNonInteractiveOrCI()) {
		const { data } = await fetchPage(args.ID);
		const rows = buildInstanceRows(data);
		if (rows.length === 0) {
			logger.log(
				"No instances found for this application. The application may not have any running containers."
			);
			return;
		}
		renderTable(rows);
		return;
	}

	// Interactive: display one page at a time
	const { start, stop } = spinner();
	let pageToken: string | undefined;
	let totalShown = 0;
	let stopped = false;

	do {
		start("Loading instances");
		let data: DashApplicationInstances;
		let nextPageToken: string | undefined;
		try {
			const result = await fetchPage(args.ID, args.perPage, pageToken);
			data = result.data;
			nextPageToken = result.nextPageToken;
		} finally {
			stop();
		}
		const rows = buildInstanceRows(data);

		if (rows.length === 0 && totalShown === 0) {
			logger.log(
				"No instances found for this application. The application may not have any running containers."
			);
			return;
		}

		if (rows.length > 0) {
			renderTable(rows);
			totalShown += rows.length;
		}

		pageToken = nextPageToken;

		if (pageToken) {
			logger.log(
				dim(
					`Showing ${totalShown} instances. Press Enter to load ${args.perPage} more, or q/Esc to stop.`
				)
			);
			await new Promise<void>((resolve) => {
				const cleanup = onKeyPress(
					(key) => {
						if (key.name === "return") {
							cleanup();
							resolve();
						} else if (
							key.name === "escape" ||
							key.name === "q" ||
							(key.name === "c" && key.ctrl)
						) {
							cleanup();
							stopped = true;
							resolve();
						}
					},
					{ escapeCodeTimeout: 25 }
				);
			});
		}
	} while (pageToken && !stopped);
}

export const containersInstancesCommand = createCommand({
	metadata: {
		description: "List container instances for an application",
		status: "open beta",
		owner: "Product: Cloudchamber",
	},
	behaviour: {
		printBanner: (args) => !args.json && !isNonInteractiveOrCI(),
	},
	args: instancesArgs,
	positionalArgs: ["ID"],
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, containersScope);
		await instancesCommand(args);
	},
});
