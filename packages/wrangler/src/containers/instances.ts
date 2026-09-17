import { dim, green, red } from "@cloudflare/cli-shared-helpers/colors";
import { spinner } from "@cloudflare/cli-shared-helpers/interactive";
import {
	ApiError,
	ApplicationsService,
	listContainerInstances,
} from "@cloudflare/containers-shared";
import { JsonFriendlyFatalError, UserError } from "@cloudflare/workers-utils";
import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import { fillOpenAPIConfiguration } from "../cloudchamber/common";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { onKeyPress } from "../utils/onKeyPress";
import {
	isNamespaceApplicationId,
	normalizeApplicationId,
} from "./application-id";
import { containersScope } from "./index";
import type { HandlerArgs, NamedArgDefinitions } from "../core/types";
import type {
	ContainerInstance,
	DashApplicationDurableObjectInstance,
	DashApplicationInstance,
	DashApplicationInstances,
	ResultInfo,
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

const DEFAULT_PER_PAGE = 25;

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
	id: string;
	name?: string;
	state: InstanceState;
	location?: string;
	version?: number;
	created?: string;
	canonical?: ContainerInstance;
	isDurableObject: boolean;
};

type CanonicalInstanceRow = InstanceRow & {
	canonical: ContainerInstance;
};

function isCanonicalInstanceRow(row: InstanceRow): row is CanonicalInstanceRow {
	return row.canonical !== undefined;
}

/**
 * Join instances with durable_objects data. When DO data is present,
 * DOs are correlated to instances via deployment_id. DOs without a
 * matching running instance are included with state "inactive".
 */
function buildInstanceRows(data: DashApplicationInstances): InstanceRow[] {
	const doList = data.durable_objects ?? [];

	if (doList.length === 0) {
		return data.instances.map((instance) => ({
			id: instance.id,
			state: deriveInstanceState(instance),
			location: instance.location,
			version: instance.app_version,
			created: instance.created_at,
			isDurableObject: false,
		}));
	}

	// Build a map from deployment_id -> instance for fast lookup
	const instanceByDeploymentId = new Map<string, DashApplicationInstance>();
	for (const inst of data.instances) {
		instanceByDeploymentId.set(inst.id, inst);
	}

	return doList.map((doInst) => {
		const instance = doInst.deployment_id
			? instanceByDeploymentId.get(doInst.deployment_id)
			: undefined;
		return {
			id: doInst.id,
			name: doInst.name,
			state: instance ? deriveInstanceState(instance) : "inactive",
			location: instance?.location,
			version: instance?.app_version,
			created: instance?.created_at ?? doInst.assigned_at,
			isDurableObject: true,
		};
	});
}

function buildContainerInstanceRows(data: ContainerInstance[]): InstanceRow[] {
	return data.map((instance) => ({
		id: instance.id,
		name: instance.name,
		state: instance.status.state,
		location: instance.location?.name,
		canonical: instance,
		isDurableObject: true,
	}));
}

function filterInstanceRows(
	rows: InstanceRow[],
	search?: string
): InstanceRow[] {
	if (search === undefined) {
		return rows;
	}

	return rows.filter((row) => row.id === search || row.name === search);
}

type InstancePage = {
	rows: InstanceRow[];
	nextPageToken?: string;
	resultInfo?: ResultInfo;
};

type InstanceSource = "canonical" | "dash";

type CanonicalInstanceFilters = {
	state?: "active" | "not-active";
	namePrefix?: string;
};

type RawInstancePage =
	| {
			kind: "canonical";
			data: ContainerInstance[];
			nextPageToken?: string;
			resultInfo?: ResultInfo;
	  }
	| {
			kind: "dash";
			data: DashApplicationInstances;
			nextPageToken?: string;
			resultInfo?: ResultInfo;
	  };

function throwInstanceFetchError(err: unknown): never {
	if (!(err instanceof Error)) {
		throw err;
	}

	if (err instanceof ApiError) {
		if (err.status === 400 || err.status === 404) {
			throw new UserError(
				`There has been an error fetching instances.\n${err.body.error}\nUse \`wrangler containers list\` to view your container applications and corresponding IDs.`,
				{ telemetryMessage: "containers instances fetch failed" }
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

function resolveInstanceSource(applicationId: string): InstanceSource {
	return isNamespaceApplicationId(applicationId) ? "canonical" : "dash";
}

async function fetchRawPage(
	applicationId: string,
	source: InstanceSource,
	perPage?: number,
	pageToken?: string,
	filters?: CanonicalInstanceFilters
): Promise<RawInstancePage> {
	try {
		if (source === "canonical") {
			const page = await listContainerInstances(
				applicationId,
				perPage,
				pageToken,
				filters?.state,
				filters?.namePrefix
			);
			return {
				kind: "canonical",
				data: page.data.instances,
				nextPageToken: page.resultInfo?.next_page_token,
				resultInfo: page.resultInfo,
			};
		}

		const page = await ApplicationsService.listDashApplicationInstances(
			applicationId,
			perPage,
			pageToken
		);
		return {
			kind: "dash",
			data: page.data,
			nextPageToken: page.resultInfo?.next_page_token,
			resultInfo: page.resultInfo,
		};
	} catch (err) {
		throwInstanceFetchError(err);
	}
}

async function fetchPage(
	applicationId: string,
	source: InstanceSource,
	perPage?: number,
	pageToken?: string,
	filters?: CanonicalInstanceFilters
): Promise<InstancePage> {
	const page = await fetchRawPage(
		applicationId,
		source,
		perPage,
		pageToken,
		filters
	);
	return {
		rows:
			page.kind === "canonical"
				? buildContainerInstanceRows(page.data)
				: buildInstanceRows(page.data),
		nextPageToken: page.nextPageToken,
		resultInfo: page.resultInfo,
	};
}

async function fetchAllRows(
	applicationId: string,
	source: InstanceSource,
	perPage?: number,
	filters?: CanonicalInstanceFilters
): Promise<InstanceRow[]> {
	const firstPage = await fetchRawPage(
		applicationId,
		source,
		perPage,
		undefined,
		filters
	);

	if (firstPage.kind === "canonical") {
		const instances = [...firstPage.data];
		let pageToken = firstPage.nextPageToken;

		while (pageToken) {
			const result = await fetchRawPage(
				applicationId,
				"canonical",
				perPage,
				pageToken,
				filters
			);
			if (result.kind !== "canonical") {
				throw new Error("Unexpected legacy instance response");
			}
			instances.push(...result.data);
			pageToken = result.nextPageToken;
		}

		return buildContainerInstanceRows(instances);
	}

	// Dash pages can split a Durable Object and its deployment, so join only
	// after all raw API data is present.
	const instances: DashApplicationInstance[] = [...firstPage.data.instances];
	const durableObjects: DashApplicationDurableObjectInstance[] = [
		...(firstPage.data.durable_objects ?? []),
	];
	let pageToken = firstPage.nextPageToken;

	while (pageToken) {
		const result = await fetchRawPage(
			applicationId,
			"dash",
			perPage,
			pageToken
		);
		if (result.kind !== "dash") {
			throw new Error("Unexpected canonical instance response");
		}
		instances.push(...result.data.instances);
		durableObjects.push(...(result.data.durable_objects ?? []));
		pageToken = result.nextPageToken;
	}

	return buildInstanceRows({
		instances,
		durable_objects: durableObjects,
	});
}

function rowsToJsonOutput(rows: InstanceRow[]): unknown[] {
	if (rows.every(isCanonicalInstanceRow)) {
		return rows.map((row) => row.canonical);
	}

	const hasDurableObjects = rows.some((row) => row.isDurableObject);

	if (hasDurableObjects) {
		return rows.map((row) => ({
			id: row.id,
			name: row.name ?? null,
			state: row.state,
			location: row.location ?? null,
			version: row.version ?? null,
			created: row.created ?? null,
		}));
	}

	return rows.map((row) => ({
		id: row.id,
		state: row.state,
		location: row.location ?? null,
		version: row.version ?? null,
		created: row.created ?? null,
	}));
}

function instancesToJsonOutput(
	rows: InstanceRow[],
	perPage: number,
	pageToken?: string,
	nextPageToken?: string
) {
	return {
		instances: rowsToJsonOutput(rows),
		result_info: {
			per_page: perPage,
			page_token: pageToken ?? null,
			next_page_token: nextPageToken ?? null,
		},
	};
}

function renderTable(rows: InstanceRow[]): void {
	if (rows.every(isCanonicalInstanceRow)) {
		logger.table(
			rows.map((row) => ({
				INSTANCE: row.id,
				NAME: row.name ?? "-",
				STATE: colorState(row.state),
				LOCATION: row.canonical.location?.name ?? "-",
				REGION: row.canonical.location?.region ?? "-",
				"EXIT CODE":
					row.canonical.status.exit_code === undefined
						? "-"
						: String(row.canonical.status.exit_code),
				STARTED: row.canonical.started_at ?? "-",
			}))
		);
		return;
	}

	const hasDurableObjects = rows.some((row) => row.isDurableObject);

	if (hasDurableObjects) {
		logger.table(
			rows.map((row) => ({
				INSTANCE: row.id,
				NAME: row.name ?? "-",
				STATE: colorState(row.state),
				LOCATION: row.location ?? "-",
				VERSION: row.version === undefined ? "-" : String(row.version),
				CREATED: row.created ?? "-",
			}))
		);
	} else {
		logger.table(
			rows.map((row) => ({
				INSTANCE: row.id,
				STATE: colorState(row.state),
				LOCATION: row.location ?? "-",
				VERSION: row.version === undefined ? "-" : String(row.version),
				CREATED: row.created ?? "-",
			}))
		);
	}
}

const instancesArgs = {
	ID: {
		describe: "ID of the container application to list instances for",
		type: "string",
		demandOption: true,
	},
	"per-page": {
		describe: "Number of instances per page",
		type: "number",
		coerce: (val: number) => {
			if (!Number.isInteger(val) || val < 1 || val > 1000) {
				throw new UserError(
					"--per-page must be an integer between 1 and 1000",
					{
						telemetryMessage: "containers instances invalid per-page",
					}
				);
			}
			return val;
		},
	},
	"experimental-instance-filters": {
		alias: "x-instance-filters",
		describe: "Enable experimental namespace instance filters",
		type: "boolean",
		default: false,
	},
	state: {
		describe:
			"Filter namespace-backed instances by lifecycle state (requires --experimental-instance-filters)",
		choices: ["active", "not-active"] as const,
	},
	"name-prefix": {
		describe:
			"Filter namespace-backed instances by a case-sensitive name prefix (requires --experimental-instance-filters)",
		type: "string",
		conflicts: "search",
	},
	search: {
		describe: "Find instances matching an exact instance ID or name",
		type: "string",
		conflicts: "page-token",
	},
	"page-token": {
		describe: "Continuation token for explicitly paginated JSON output",
		type: "string",
		conflicts: "search",
	},
	json: {
		describe: "Return output as JSON",
		type: "boolean",
		default: false,
	},
} as const satisfies NamedArgDefinitions;

type InstancesArgs = HandlerArgs<typeof instancesArgs>;

export async function instancesCommand(args: InstancesArgs): Promise<void> {
	const applicationId = normalizeApplicationId(args.ID);
	if (applicationId === undefined) {
		throw new UserError(
			`Expected an application ID but got ${args.ID}. Use \`wrangler containers list\` to view your container applications and corresponding IDs.`,
			{ telemetryMessage: "containers instances invalid application id" }
		);
	}
	if (args.pageToken !== undefined && !args.json) {
		throw new UserError("--page-token requires --json", {
			telemetryMessage: "containers instances page-token without json",
		});
	}

	const perPage = args.perPage ?? DEFAULT_PER_PAGE;
	const source = resolveInstanceSource(applicationId);
	const filters: CanonicalInstanceFilters = {
		state: args.state,
		namePrefix: args.namePrefix,
	};
	const hasFilters = args.state !== undefined || args.namePrefix !== undefined;

	if (hasFilters && source === "dash") {
		throw new UserError(
			"--state and --name-prefix are only supported for namespace-backed applications",
			{
				telemetryMessage:
					"containers instances canonical filter for uuid application",
			}
		);
	}
	if (hasFilters && !args.experimentalInstanceFilters) {
		throw new UserError(
			"--state and --name-prefix require --experimental-instance-filters (or --x-instance-filters)",
			{
				telemetryMessage:
					"containers instances filters require experimental flag",
			}
		);
	}

	// --json: output JSON and exit
	if (args.json) {
		try {
			if (args.search !== undefined) {
				const rows = filterInstanceRows(
					await fetchAllRows(applicationId, source, perPage, filters),
					args.search
				);
				logger.json(rowsToJsonOutput(rows));
				return;
			}

			const isPaginated =
				args.perPage !== undefined || args.pageToken !== undefined;
			if (!isPaginated) {
				logger.json(
					rowsToJsonOutput(
						await fetchAllRows(applicationId, source, undefined, filters)
					)
				);
				return;
			}

			const result = await fetchPage(
				applicationId,
				source,
				args.perPage,
				args.pageToken,
				filters
			);

			logger.json(
				instancesToJsonOutput(
					result.rows,
					result.resultInfo?.per_page ?? perPage,
					result.resultInfo?.page_token ?? args.pageToken,
					result.nextPageToken
				)
			);
			return;
		} catch (err) {
			if (err instanceof UserError) {
				throw err;
			}
			const message = err instanceof Error ? err.message : "Unknown error";
			throw new JsonFriendlyFatalError(JSON.stringify({ error: message }), {
				telemetryMessage: "containers instances json output failed",
			});
		}
	}

	// Exact lookups must inspect every page before rendering matches.
	if (args.search !== undefined) {
		let rows: InstanceRow[];
		if (isNonInteractiveOrCI()) {
			rows = await fetchAllRows(applicationId, source, perPage, filters);
		} else {
			const { start, stop } = spinner();
			start("Finding instances");
			try {
				rows = await fetchAllRows(applicationId, source, perPage, filters);
			} finally {
				stop();
			}
		}

		const matches = filterInstanceRows(rows, args.search);
		if (matches.length === 0) {
			logger.log(
				`No instances found matching "${args.search}" by exact ID or name.`
			);
			return;
		}
		renderTable(matches);
		return;
	}

	// Non-interactive: fetch all results, render a single table, no pagination
	if (isNonInteractiveOrCI()) {
		const rows = await fetchAllRows(applicationId, source, undefined, filters);
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
		let rows: InstanceRow[];
		let nextPageToken: string | undefined;
		try {
			const result = await fetchPage(
				applicationId,
				source,
				perPage,
				pageToken,
				filters
			);
			rows = result.rows;
			nextPageToken = result.nextPageToken;
		} finally {
			stop();
		}

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
					`Showing ${totalShown} instances. Press Enter to load ${perPage} more, or q/Esc to stop.`
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
		status: "stable",
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
