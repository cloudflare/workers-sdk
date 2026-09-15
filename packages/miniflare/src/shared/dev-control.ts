import type { SqlStorage, SqlStorageValue } from "@cloudflare/workers-types";

export type DurableObjectIdentifier =
	| { name: string; id?: never }
	| { id: string; name?: never };

export type DurableObjectEvictionOptions = DurableObjectIdentifier & {
	webSockets?: "close" | "hibernate";
};

export type DurableObjectStorageOptions = DurableObjectIdentifier;

export type DurableObjectStorageHandle = {
	exec<
		Row extends Record<string, SqlStorageValue> = Record<
			string,
			SqlStorageValue
		>,
	>(
		...args: Parameters<SqlStorage["exec"]>
	): Promise<Row[]>;
};

export type DurableObjectStorageOperationOptions = DurableObjectIdentifier & {
	query: string;
	bindings: unknown[];
};

export interface DevControl {
	evictDurableObject(
		scriptName: string,
		className: string,
		options: DurableObjectEvictionOptions
	): Promise<void>;
	execDurableObjectSql<Row extends Record<string, SqlStorageValue>>(
		scriptName: string,
		className: string,
		options: DurableObjectStorageOperationOptions
	): Promise<Row[]>;
}

export function createDurableObjectStorageHandle(
	control: DevControl,
	scriptName: string,
	className: string,
	options: DurableObjectStorageOptions
): DurableObjectStorageHandle {
	return {
		async exec(query, ...bindings) {
			return control.execDurableObjectSql(scriptName, className, {
				...options,
				query,
				bindings,
			});
		},
	};
}

export function getDevControlDurableObjectBindingName(
	scriptName: string,
	className: string
) {
	return ["MINIFLARE_DEV_CONTROL_DO", scriptName, className].join(":");
}
