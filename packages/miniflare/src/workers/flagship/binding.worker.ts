// Local stub for Flagship feature flag binding.
// In local dev mode, all flag evaluations return the provided default value.
// Use `wrangler dev --remote` to evaluate flags against the real Flagship service.

import { WorkerEntrypoint } from "cloudflare:workers";

interface EvaluationDetails<T> {
	flagKey: string;
	value: T;
	variant?: string;
	reason?: string;
	errorCode?: string;
	errorMessage?: string;
}

export class FlagshipBinding extends WorkerEntrypoint {
	async get(
		_flagKey: string,
		defaultValue?: unknown,
		_context?: Record<string, string | number | boolean>
	): Promise<unknown> {
		return defaultValue;
	}

	async getBooleanValue(
		_flagKey: string,
		defaultValue: boolean,
		_context?: Record<string, string | number | boolean>
	): Promise<boolean> {
		return defaultValue;
	}

	async getStringValue(
		_flagKey: string,
		defaultValue: string,
		_context?: Record<string, string | number | boolean>
	): Promise<string> {
		return defaultValue;
	}

	async getNumberValue(
		_flagKey: string,
		defaultValue: number,
		_context?: Record<string, string | number | boolean>
	): Promise<number> {
		return defaultValue;
	}

	async getObjectValue<T extends object>(
		_flagKey: string,
		defaultValue: T,
		_context?: Record<string, string | number | boolean>
	): Promise<T> {
		return defaultValue;
	}

	async getBooleanDetails(
		flagKey: string,
		defaultValue: boolean,
		_context?: Record<string, string | number | boolean>
	): Promise<EvaluationDetails<boolean>> {
		return {
			flagKey,
			value: defaultValue,
			reason: "DEFAULT",
		};
	}

	async getStringDetails(
		flagKey: string,
		defaultValue: string,
		_context?: Record<string, string | number | boolean>
	): Promise<EvaluationDetails<string>> {
		return {
			flagKey,
			value: defaultValue,
			reason: "DEFAULT",
		};
	}

	async getNumberDetails(
		flagKey: string,
		defaultValue: number,
		_context?: Record<string, string | number | boolean>
	): Promise<EvaluationDetails<number>> {
		return {
			flagKey,
			value: defaultValue,
			reason: "DEFAULT",
		};
	}

	async getObjectDetails<T extends object>(
		flagKey: string,
		defaultValue: T,
		_context?: Record<string, string | number | boolean>
	): Promise<EvaluationDetails<T>> {
		return {
			flagKey,
			value: defaultValue,
			reason: "DEFAULT",
		};
	}
}
