import { WorkerEntrypoint } from "cloudflare:workers";
import { ADMIN_API } from "./constants";
import {
	evaluateFlag,
	FlagConfigError,
	matchesType,
	TypeCastError,
} from "./evaluate";
import { flagConflictMessage, flagNotFoundMessage } from "./flags";
import type { FlagshipAdmin } from "./admin";
import type {
	ErrorCode,
	EvaluationContext,
	EvaluationDetails,
	FlagType,
	FlagValue,
} from "./evaluate";
import type { Flag, FlagInput } from "./flags";
import type { FlagshipObject, WriteResult } from "./object.worker";

interface Env {
	store: DurableObjectNamespace<FlagshipObject>;
}

interface Props {
	appId: string;
	accountTag: string;
}

// Keep the default name: workerd prefixes custom error names during RPC serialization.
class FlagNotFoundError extends Error {
	constructor(flagKey: string) {
		super(flagNotFoundMessage(flagKey));
	}
}

class FlagConflictError extends Error {
	constructor(flagKey: string) {
		super(flagConflictMessage(flagKey));
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
		`Flagship: flag '${flag.key}' has a percentage rollout, but the local flag store has no account tag, so its buckets will not match your remote app. Run \`flagship flags pull\` to seed the store.`
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

type FlagshipStub = DurableObjectStub<FlagshipObject>;

function getStub(env: Env, appId: string): FlagshipStub {
	return env.store.get(env.store.idFromName(appId));
}

async function evaluate(
	stub: FlagshipStub,
	flagKey: string,
	context: EvaluationContext,
	fallbackAccountTag: string
): Promise<EvaluationDetails<FlagValue>> {
	if (typeof flagKey !== "string" || flagKey === "") {
		throw new Error("flagKey must be a non-empty string");
	}
	const { flag, accountTag } = await stub.getForEvaluation(flagKey);
	if (flag === null) {
		throw new FlagNotFoundError(flagKey);
	}
	if (accountTag === null) {
		warnIfBucketingUnseeded(flag);
	}
	return {
		flagKey,
		...evaluateFlag(flag, context, accountTag ?? fallbackAccountTag),
	};
}

function createAdmin(
	stub: FlagshipStub,
	fallbackAccountTag: string
): FlagshipAdmin {
	function unwrap(result: WriteResult, flagKey: string): Flag {
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
	}
	async function getFlag(flagKey: string): Promise<Flag> {
		const flag = await stub.get(flagKey);
		if (flag === null) {
			throw new FlagNotFoundError(flagKey);
		}
		return flag;
	}
	async function write(
		operation: Promise<WriteResult>,
		flagKey: string
	): Promise<Flag> {
		return unwrap(await operation, flagKey);
	}
	async function writeInput(
		operation: Promise<WriteResult>,
		input: unknown
	): Promise<Flag> {
		const flagKey =
			typeof input === "object" &&
			input !== null &&
			"key" in input &&
			typeof input.key === "string"
				? input.key
				: "";
		return unwrap(await operation, flagKey);
	}

	return {
		listFlags: (): Promise<Flag[]> => stub.list(),
		getFlag,
		getAccountTag: (): Promise<string | null> => stub.getAccountTag(),
		setAccountTag: (accountTag: string): Promise<void> => {
			validateAccountTag(accountTag);
			return stub.setAccountTag(accountTag);
		},
		createFlag: (input) => writeInput(stub.create(input), input),
		updateFlag: (flagKey, input) => write(stub.update(flagKey, input), flagKey),
		patchFlag: (flagKey, changes) =>
			write(stub.patch(flagKey, changes), flagKey),
		putFlag: (input) => writeInput(stub.put(input), input),
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
			evaluate(stub, flagKey, context ?? {}, fallbackAccountTag),
	};
}

export class FlagshipBinding extends WorkerEntrypoint<Env, Props> {
	get #stub(): FlagshipStub {
		return getStub(this.env, this.ctx.props.appId);
	}

	#evaluate(
		flagKey: string,
		context: EvaluationContext
	): Promise<EvaluationDetails<FlagValue>> {
		return evaluate(this.#stub, flagKey, context, this.ctx.props.accountTag);
	}

	async #typedDetails<T>(
		flagKey: string,
		defaultValue: T,
		expectedType: FlagType,
		context?: EvaluationContext
	): Promise<EvaluationDetails<T>> {
		const failure = (
			errorCode: ErrorCode,
			errorMessage: string
		): EvaluationDetails<T> => ({
			flagKey,
			value: defaultValue,
			variant: "default",
			reason: "ERROR",
			errorCode,
			errorMessage,
		});
		let result: EvaluationDetails<FlagValue>;
		try {
			result = await this.#evaluate(flagKey, context ?? {});
		} catch (error) {
			const errorCode = errorCodeFor(error);
			if (errorCode === undefined) {
				throw error;
			}
			return failure(errorCode, (error as Error).message);
		}

		const metadata = result.metadata ? { metadata: result.metadata } : {};
		if (!matchesType(result.value, expectedType)) {
			return {
				...failure(
					"TYPE_MISMATCH",
					new TypeCastError(flagKey, expectedType, result.value).message
				),
				...metadata,
			};
		}

		return {
			flagKey,
			value: result.value as T,
			variant: result.variant,
			reason: result.reason,
			...metadata,
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
		return createAdmin(this.#stub, this.ctx.props.accountTag);
	}
}

/** Gives the Local Explorer admin access to any app's flag stub. */
export class FlagshipExplorer extends WorkerEntrypoint<
	Env,
	Pick<Props, "accountTag">
> {
	[ADMIN_API](appId: string): FlagshipAdmin {
		return createAdmin(getStub(this.env, appId), this.ctx.props.accountTag);
	}
}
