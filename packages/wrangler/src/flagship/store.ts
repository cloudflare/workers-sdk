import { UserError } from "@cloudflare/workers-utils";
import {
	createFlag,
	deleteFlag,
	evaluateFlag,
	getFlag,
	listAllFlags,
	listFlags,
	updateFlag,
} from "./client";
import { usingLocalFlagshipAPI } from "./local";
import type { EvaluationResult, Flag, FlagInput, Page } from "./client";
import type { Config } from "@cloudflare/workers-utils";
import type { FlagshipAdmin } from "miniflare";

/**
 * The flag operations shared by the remote Flagship API and the local flag
 * store, bound to a single app so commands do not repeat `config` and `appId`.
 */
export interface FlagStore {
	listFlags(limit?: number, cursor?: string): Promise<Page<Flag>>;
	listAllFlags(): Promise<Flag[]>;
	getFlag(flagKey: string): Promise<Flag>;
	createFlag(flag: FlagInput): Promise<Flag>;
	updateFlag(flagKey: string, flag: FlagInput): Promise<Flag>;
	deleteFlag(flagKey: string): Promise<{ key: string }>;
	evaluateFlag(
		flagKey: string,
		context: Record<string, string>
	): Promise<EvaluationResult>;
}

/** Arguments every Flagship flag command accepts to choose a flag store. */
export interface FlagStoreArgs {
	local?: boolean;
	remote?: boolean;
	persistTo?: string;
}

/** The `--local` / `--remote` / `--persist-to` arguments, for command definitions. */
export const flagStoreArgDefinitions = {
	local: {
		type: "boolean",
		description: "Use the local flag store instead of the remote app",
	},
	remote: {
		type: "boolean",
		description: "Use the remote app instead of the local flag store",
	},
	"persist-to": {
		type: "string",
		description: "Specify directory to use for local persistence",
		requiresArg: true,
	},
} as const;

/**
 * Whether a command should act on the local flag store. Flag commands default
 * to remote, matching the rest of `wrangler flagship`.
 *
 * @param args The command's parsed arguments.
 * @returns `true` when the local store should be used.
 */
export function useLocalStore(args: FlagStoreArgs): boolean {
	return args.local === true || args.remote === false;
}

function remoteStore(config: Config, appId: string): FlagStore {
	return {
		listFlags: (limit, cursor) => listFlags(config, appId, limit, cursor),
		listAllFlags: () => listAllFlags(config, appId),
		getFlag: (flagKey) => getFlag(config, appId, flagKey),
		createFlag: (flag) => createFlag(config, appId, flag),
		updateFlag: (flagKey, flag) => updateFlag(config, appId, flagKey, flag),
		deleteFlag: (flagKey) => deleteFlag(config, appId, flagKey),
		evaluateFlag: (flagKey, context) =>
			evaluateFlag(config, appId, flagKey, context),
	};
}

function localStore(admin: FlagshipAdmin): FlagStore {
	return {
		// The local store holds every flag in one place, so it has nothing to
		// paginate over and always reports an exhausted cursor.
		listFlags: async (limit, cursor) => {
			if (cursor !== undefined) {
				throw new UserError(
					"The local flag store is not paginated, so --cursor cannot be used with --local.",
					{ telemetryMessage: "flagship local store cursor unsupported" }
				);
			}
			const items = await admin.listFlags();
			return {
				items: limit === undefined ? items : items.slice(0, limit),
				cursor: null,
			};
		},
		listAllFlags: () => admin.listFlags(),
		getFlag: (flagKey) => admin.getFlag(flagKey),
		createFlag: (flag) => admin.createFlag(flag),
		updateFlag: (flagKey, flag) => admin.updateFlag(flagKey, flag),
		deleteFlag: async (flagKey) => {
			await admin.deleteFlag(flagKey);
			return { key: flagKey };
		},
		evaluateFlag: (flagKey, context) => admin.evaluateFlag(flagKey, context),
	};
}

/**
 * Run a closure against the flag store the user asked for, opening and
 * disposing the local store when `--local` is set.
 *
 * The closure must fully resolve anything it returns: the local store is
 * reached over RPC, and its stubs are poisoned once the instance is disposed.
 *
 * @param args The command's parsed arguments.
 * @param config The resolved Wrangler configuration.
 * @param appId The Flagship app to act on.
 * @param closure Receives the selected flag store.
 * @returns Whatever the closure returns.
 */
export async function withFlagStore<T>(
	args: FlagStoreArgs,
	config: Config,
	appId: string,
	closure: (store: FlagStore) => Promise<T>
): Promise<T> {
	if (!useLocalStore(args)) {
		if (args.persistTo !== undefined) {
			throw new UserError(
				"Cannot use --persist-to without --local. The --persist-to flag specifies a local persistence directory, which requires the --local flag.",
				{ telemetryMessage: "flagship persist-to requires local" }
			);
		}
		return closure(remoteStore(config, appId));
	}
	return usingLocalFlagshipAPI(args.persistTo, config, appId, (admin) =>
		closure(localStore(admin))
	);
}
