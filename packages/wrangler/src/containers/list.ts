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
import type { DashApplication } from "@cloudflare/containers-shared";

type ContainerState = "active" | "ready" | "provisioning" | "degraded";

function deriveContainerState(app: DashApplication): ContainerState {
	const h = app.health.instances;
	if (h.failed > 0) {
		return "degraded";
	}
	if (h.starting > 0 || h.scheduling > 0) {
		return "provisioning";
	}
	if (h.active > 0) {
		return "active";
	}
	return "ready";
}

function colorState(state: ContainerState): string {
	switch (state) {
		case "active":
			return green(state);
		case "degraded":
			return red(state);
		default:
			return state;
	}
}

async function fetchContainerPage(
	perPage?: number,
	pageToken?: string
): Promise<{ data: DashApplication[]; nextPageToken?: string }> {
	try {
		const page = await ApplicationsService.listDashApplications(
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
					`There has been an error listing containers.\n${err.body.error}`
				);
			}

			throw new Error(
				`There has been an unknown error listing containers.\n${JSON.stringify(err.body)}`
			);
		}

		throw new Error(
			`There has been an internal error listing containers.\n${err.message}`
		);
	}
}

function renderContainerTable(apps: DashApplication[]) {
	logger.table(
		apps.map((app) => {
			const state = deriveContainerState(app);
			return {
				ID: app.id,
				NAME: app.name,
				STATE: colorState(state),
				"LIVE INSTANCES": String(app.instances),
				"LAST MODIFIED": app.updated_at,
			};
		})
	);
}

function appsToJsonOutput(apps: DashApplication[]) {
	return apps.map((app) => ({
		id: app.id,
		name: app.name,
		state: deriveContainerState(app),
		instances: app.instances,
		image: app.image,
		version: app.version,
		updated_at: app.updated_at,
		created_at: app.created_at,
	}));
}

const listArgs = {
	"per-page": {
		describe: "Number of containers per page",
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

type ListArgs = HandlerArgs<typeof listArgs>;

export async function listCommand(args: ListArgs): Promise<void> {
	// --json: output JSON and exit
	if (args.json) {
		try {
			const { data } = await fetchContainerPage();
			logger.json(appsToJsonOutput(data));
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
		const { data } = await fetchContainerPage();
		if (data.length === 0) {
			logger.log("No containers found.");
			return;
		}
		renderContainerTable(data);
		return;
	}

	// Interactive: display one page at a time.
	// We buffer results client-side so that --per-page always works, even
	// when the server returns all results in a single response (e.g. non-V3
	// accounts where server-side pagination is not supported).
	const { start, stop } = spinner();
	let pageToken: string | undefined;
	let totalShown = 0;
	let stopped = false;
	let buffer: DashApplication[] = [];

	do {
		// Refill buffer from API when empty
		if (buffer.length === 0) {
			start("Loading containers");
			try {
				const { data, nextPageToken } = await fetchContainerPage(
					args.perPage,
					pageToken
				);
				buffer = data;
				pageToken = nextPageToken;
			} finally {
				stop();
			}
		}

		if (buffer.length === 0 && totalShown === 0) {
			logger.log("No containers found.");
			return;
		}

		// Display at most perPage items from the buffer
		const chunk = buffer.splice(0, args.perPage);
		if (chunk.length > 0) {
			renderContainerTable(chunk);
			totalShown += chunk.length;
		}

		const hasMore = buffer.length > 0 || pageToken;
		if (hasMore) {
			logger.log(
				dim(
					`Showing ${totalShown} containers. Press Enter to load ${args.perPage} more, or q/Esc to stop.`
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
	} while ((buffer.length > 0 || pageToken) && !stopped);
}

export const containersListCommand = createCommand({
	metadata: {
		description: "List containers",
		status: "open beta",
		owner: "Product: Cloudchamber",
	},
	behaviour: {
		printBanner: (args) => !args.json && !isNonInteractiveOrCI(),
	},
	args: listArgs,
	async handler(args, { config }) {
		await fillOpenAPIConfiguration(config, containersScope);
		await listCommand(args);
	},
});
