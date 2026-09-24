import type {
	OutputCall,
	OutputObject,
	OutputProperty,
	OutputValue,
} from "./types";

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOwn(record: UnknownRecord, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(record, key);
}

export function getRecord(
	record: UnknownRecord,
	key: string
): UnknownRecord | undefined {
	const value = record[key];
	return isRecord(value) ? value : undefined;
}

export function getRecords(
	record: UnknownRecord,
	key: string
): UnknownRecord[] {
	const value = record[key];
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function getStrings(record: UnknownRecord, key: string): string[] {
	const value = record[key];
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

export function toOutputValue(value: unknown): OutputValue | undefined {
	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "number" ||
		typeof value === "string"
	) {
		return value;
	}

	if (Array.isArray(value)) {
		const entries: OutputValue[] = [];
		for (const entry of value) {
			const converted = toOutputValue(entry);
			if (converted !== undefined) {
				entries.push(converted);
			}
		}

		return entries;
	}

	if (isRecord(value)) {
		return objectFromRecord(value);
	}

	return undefined;
}

export function objectFromRecord(
	record: UnknownRecord,
	transformKey: (key: string) => string = (key) => key
): OutputObject {
	const properties: OutputProperty[] = [];
	for (const [key, value] of Object.entries(record)) {
		const converted = toOutputValue(value);
		if (converted !== undefined) {
			properties.push({ key: transformKey(key), value: converted });
		}
	}

	return {
		kind: "object",
		properties,
	};
}

function snakeToCamel(value: string): string {
	return value.replace(/_([a-z])/g, (_, letter: string) =>
		letter.toUpperCase()
	);
}

function toCamelOutputValue(value: unknown): OutputValue | undefined {
	if (isRecord(value)) {
		return camelObject(value);
	}

	if (Array.isArray(value)) {
		return value
			.map(toCamelOutputValue)
			.filter((entry): entry is OutputValue => entry !== undefined);
	}

	return toOutputValue(value);
}

export function camelObject(record: UnknownRecord): OutputObject {
	const properties: OutputProperty[] = [];
	for (const [key, value] of Object.entries(record)) {
		const converted = toCamelOutputValue(value);

		if (converted !== undefined) {
			properties.push({ key: snakeToCamel(key), value: converted });
		}
	}

	return {
		kind: "object",
		properties,
	};
}

export function call(callee: string, ...args: OutputValue[]): OutputCall {
	return {
		args,
		callee,
		kind: "call",
	};
}

export function optionsFromRecord(
	record: UnknownRecord,
	mappings: ReadonlyArray<readonly [string, string]>,
	includeRemote = false
): OutputObject {
	const properties: OutputProperty[] = [];
	for (const [sourceKey, targetKey] of mappings) {
		const value = toOutputValue(record[sourceKey]);
		if (value !== undefined) {
			properties.push({
				key: targetKey,
				value,
			});
		}
	}

	if (includeRemote && typeof record.remote === "boolean") {
		properties.push({
			key: "dev",
			value: {
				kind: "object",
				properties: [
					{
						key: "remote",
						value: record.remote,
					},
				],
			},
		});
	}

	return {
		kind: "object",
		properties,
	};
}

export function addProperty(
	properties: OutputProperty[],
	source: UnknownRecord,
	sourceKey: string,
	targetKey: string = sourceKey,
	transform: (value: unknown) => OutputValue | undefined = toOutputValue
): void {
	if (!hasOwn(source, sourceKey)) {
		return;
	}

	const value = transform(source[sourceKey]);
	if (value !== undefined) {
		properties.push({ key: targetKey, value });
	}
}
