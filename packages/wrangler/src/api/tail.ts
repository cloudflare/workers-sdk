import { readConfig } from "../config";
import { getLegacyScriptName } from "../index";
import { createTail } from "../tail";
import { translateCLICommandToFilterMessage } from "../tail/filters";
import { requireAuth } from "../user";
import { getWorkerForZone } from "../zones";
import type { ConfigPath } from "../index";
import type { TailCLIFilters } from "../tail/filters";
import type WebSocket from "ws";

type TailOptions = {
	config?: string;
	worker?: string;
	filters?: TailCLIFilters;
	environment?: string | { name: string; legacy: boolean };
};

type Tail = {
	tail: WebSocket;
	expiration: Date;
	deleteTail: () => Promise<void>;
};

export async function unstable_tail(
	url: URL,
	filters?: TailCLIFilters
): Promise<Tail>;
export async function unstable_tail(
	workerName: string,
	filters?: TailCLIFilters,
	environment?: string | { name: string; legacy: boolean }
): Promise<Tail>;
export async function unstable_tail(
	worker: string | URL,
	filters?: TailCLIFilters,
	environment?: string | { name: string; legacy: boolean }
): Promise<Tail> {
	return unstable_tail_impl({
		worker: typeof worker === "string" ? worker : worker.href,
		filters,
		environment,
	});
}

export async function unstable_tail_impl({
	config: configPath,
	worker,
	filters = {},
	environment,
}: TailOptions) {
	const env = normalizeEnv(environment);
	const config = readConfig(configPath as ConfigPath, env);

	// Worker names can't contain "." (and most routes should), so use that as a discriminator
	const scriptName = worker?.includes(".")
		? await getWorkerForZone(worker)
		: getLegacyScriptName({ name: worker, ...env }, config);

	if (!scriptName) {
		throw new Error(
			"Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with `wrangler tail <worker-name>`"
		);
	}

	const accountId = await requireAuth(config);

	return await createTail(
		accountId,
		scriptName,
		translateCLICommandToFilterMessage(filters),
		false,
		env["legacy-env"] ? env.env : undefined
	);
}

function normalizeEnv(environment: TailOptions["environment"]): {
	env: string | undefined;
	"legacy-env": boolean;
} {
	if (!environment) {
		return {
			env: undefined,
			"legacy-env": true,
		};
	}

	if (typeof environment === "string") {
		return {
			env: environment,
			// TODO: change this once legacy isn't the default
			"legacy-env": true,
		};
	}

	return {
		env: environment.name,
		"legacy-env": environment.legacy,
	};
}
