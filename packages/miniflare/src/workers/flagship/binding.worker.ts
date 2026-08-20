import { WorkerEntrypoint } from "cloudflare:workers";
import { ADMIN_API } from "./constants";
import {
	evaluateFlag,
	FlagConfigError,
	matchesType,
	TypeCastError,
} from "./evaluate";
import { flagNotFoundMessage, toEvalFlag } from "./flags";
import type { FlagshipAdmin } from "./admin";
import type {
	ErrorCode,
	EvaluationContext,
	EvaluationDetails,
	FlagType,
	FlagValue,
} from "./evaluate";
import type { Flag, FlagChanges, FlagInput } from "./flags";
import type { FlagshipObject, WriteResult } from "./object.worker";

interface Env {
	config: { appId: string; accountTag: string };
	store: DurableObjectNamespace<FlagshipObject>;
}

// `name` is deliberately left as "Error": workerd's RPC serialisation prefixes
// unrecognised error names onto the message, which leaks into CLI output.
class FlagNotFoundError extends Error {
	constructor(flagKey: string) {
		super(flagNotFoundMessage(flagKey));
	}
}

class FlagConflictError extends Error {
	constructor(flagKey: string) {
		super(`Flag '${flagKey}' already exists`);
	}
}

// Module scope, so the warning fires at most once per isolate rather than once
// per evaluation.
let warnedAboutUnseededRollout = false;

function validateAccountTag(accountTag: string): void {
	if (typeof accountTag !== "string" || accountTag === "") {
		throw new Error("accountTag must be a non-empty string");
	}
}

function hasPartialRollout(flag: Flag): boolean {
	return flag.rules.some(
		(rule) => rule.rollout !== undefined && rule.rollout.percentage < 100
	);
}

function warnIfBucketingUnseeded(flag: Flag): void {
	if (warnedAboutUnseededRollout || !hasPartialRollout(flag)) {
		return;
	}
	warnedAboutUnseededRollout = true;
	console.warn(
		`Flagship: flag '${flag.key}' has a percentage rollout, but the local flag store has no account tag, so its buckets will not match your remote app. Run \`wrangler flagship flags pull\` to seed the store.`
	);
}

function errorCodeFor(error: unknown): ErrorCode | undefined {
	if (error instanceof FlagNotFoundError) {
		return "FLAG_NOT_FOUND";
	}
	if (error instanceof FlagConfigError) {
		return "PARSE_ERROR";
	}
	return undefined;
}

export class FlagshipBinding extends WorkerEntrypoint<Env> {
	get #stub() {
		const namespace = this.env.store;
		return namespace.get(namespace.idFromName(this.env.config.appId));
	}

	async #evaluate(
		flagKey: string,
		context: EvaluationContext
	): Promise<EvaluationDetails<FlagValue>> {
		if (typeof flagKey !== "string" || flagKey === "") {
			throw new Error("flagKey must be a non-empty string");
		}
		const { flag, accountTag } = await this.#stub.getForEvaluation(flagKey);
		if (flag === null) {
			throw new FlagNotFoundError(flagKey);
		}
		if (accountTag === null) {
			warnIfBucketingUnseeded(flag);
		}
		const { value, variant, reason } = evaluateFlag(
			toEvalFlag(flag),
			context,
			accountTag ?? this.env.config.accountTag
		);
		return { flagKey, value, variant, reason };
	}

	async #typedDetails<T>(
		flagKey: string,
		defaultValue: T,
		expectedType: FlagType,
		context?: EvaluationContext
	): Promise<EvaluationDetails<T>> {
		let result: EvaluationDetails<FlagValue>;
		try {
			result = await this.#evaluate(flagKey, context ?? {});
		} catch (error) {
			const errorCode = errorCodeFor(error);
			if (errorCode === undefined) {
				throw error;
			}
			return {
				flagKey,
				value: defaultValue,
				variant: "default",
				reason: "ERROR",
				errorCode,
				errorMessage: (error as Error).message,
			};
		}

		if (!matchesType(result.value, expectedType)) {
			return {
				flagKey,
				value: defaultValue,
				variant: "default",
				reason: "ERROR",
				errorCode: "TYPE_MISMATCH",
				errorMessage: new TypeCastError(flagKey, expectedType, result.value)
					.message,
			};
		}

		return {
			flagKey: result.flagKey,
			value: result.value as T,
			variant: result.variant,
			reason: result.reason,
		};
	}

	async get(
		flagKey: string,
		defaultValue?: unknown,
		context?: EvaluationContext
	): Promise<unknown> {
		try {
			return (await this.#evaluate(flagKey, context ?? {})).value;
		} catch (error) {
			if (errorCodeFor(error) !== undefined && defaultValue !== undefined) {
				return defaultValue;
			}
			throw error;
		}
	}

	async getBooleanValue(
		flagKey: string,
		defaultValue: boolean,
		context?: EvaluationContext
	): Promise<boolean> {
		return (await this.#typedDetails(flagKey, defaultValue, "boolean", context))
			.value;
	}

	async getStringValue(
		flagKey: string,
		defaultValue: string,
		context?: EvaluationContext
	): Promise<string> {
		return (await this.#typedDetails(flagKey, defaultValue, "string", context))
			.value;
	}

	async getNumberValue(
		flagKey: string,
		defaultValue: number,
		context?: EvaluationContext
	): Promise<number> {
		return (await this.#typedDetails(flagKey, defaultValue, "number", context))
			.value;
	}

	async getObjectValue<
		T extends Record<string, unknown> | unknown[] = Record<string, unknown>,
	>(flagKey: string, defaultValue: T, context?: EvaluationContext): Promise<T> {
		return (await this.#typedDetails(flagKey, defaultValue, "object", context))
			.value;
	}

	async getBooleanDetails(
		flagKey: string,
		defaultValue: boolean,
		context?: EvaluationContext
	): Promise<EvaluationDetails<boolean>> {
		return this.#typedDetails(flagKey, defaultValue, "boolean", context);
	}

	async getStringDetails(
		flagKey: string,
		defaultValue: string,
		context?: EvaluationContext
	): Promise<EvaluationDetails<string>> {
		return this.#typedDetails(flagKey, defaultValue, "string", context);
	}

	async getNumberDetails(
		flagKey: string,
		defaultValue: number,
		context?: EvaluationContext
	): Promise<EvaluationDetails<number>> {
		return this.#typedDetails(flagKey, defaultValue, "number", context);
	}

	async getObjectDetails<
		T extends Record<string, unknown> | unknown[] = Record<string, unknown>,
	>(
		flagKey: string,
		defaultValue: T,
		context?: EvaluationContext
	): Promise<EvaluationDetails<T>> {
		return this.#typedDetails(flagKey, defaultValue, "object", context);
	}

	[ADMIN_API](): FlagshipAdmin {
		const stub = this.#stub;
		const unwrap = (result: WriteResult, flagKey: string): Flag => {
			switch (result.status) {
				case "written":
					return result.flag;
				case "missing":
					throw new FlagNotFoundError(flagKey);
				case "exists":
					throw new FlagConflictError(flagKey);
				case "invalid":
					throw new Error(result.message);
			}
		};

		return {
			listFlags: (): Promise<Flag[]> => stub.list(),
			getFlag: async (flagKey: string): Promise<Flag> => {
				const flag = await stub.get(flagKey);
				if (flag === null) {
					throw new FlagNotFoundError(flagKey);
				}
				return flag;
			},
			getAccountTag: (): Promise<string | null> => stub.getAccountTag(),
			setAccountTag: (accountTag: string): Promise<void> => {
				validateAccountTag(accountTag);
				return stub.setAccountTag(accountTag);
			},
			createFlag: async (input: FlagInput): Promise<Flag> =>
				unwrap(await stub.create(input), input.key),
			updateFlag: async (flagKey: string, input: FlagInput): Promise<Flag> =>
				unwrap(await stub.update(flagKey, input), flagKey),
			patchFlag: async (flagKey: string, changes: FlagChanges): Promise<Flag> =>
				unwrap(await stub.patch(flagKey, changes), flagKey),
			putFlag: async (input: FlagInput): Promise<Flag> =>
				unwrap(await stub.put(input), input.key),
			putFlags: async (
				inputs: FlagInput[],
				accountTag: string
			): Promise<void> => {
				validateAccountTag(accountTag);
				const result = await stub.putAll(inputs, accountTag);
				if (result.status === "invalid") {
					throw new Error(result.message);
				}
			},
			deleteFlag: async (flagKey: string): Promise<void> => {
				if (!(await stub.delete(flagKey))) {
					throw new FlagNotFoundError(flagKey);
				}
			},
			evaluateFlag: (
				flagKey: string,
				context?: EvaluationContext
			): Promise<EvaluationDetails<FlagValue>> =>
				this.#evaluate(flagKey, context ?? {}),
		};
	}
}
