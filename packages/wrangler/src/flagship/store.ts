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

export interface FlagStoreArgs {
	local?: boolean;
	remote?: boolean;
	persistTo?: string;
}

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
