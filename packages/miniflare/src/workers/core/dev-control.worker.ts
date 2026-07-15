import { WorkerEntrypoint } from "cloudflare:workers";
import workerdUnsafe from "workerd:unsafe";
import { INTROSPECT_SQLITE_METHOD } from "../../plugins/core/constants";
import { getDevControlDurableObjectBindingName } from "../../shared/dev-control";
import type { IntrospectSqliteMethod } from "../../plugins/core/constants";
import type {
	DevControl as DevControlInterface,
	DurableObjectIdentifier,
	DurableObjectEvictionOptions,
	DurableObjectStorageOperationOptions,
} from "../../shared/dev-control";
import type {
	DurableObjectNamespace,
	SqlStorageValue,
} from "@cloudflare/workers-types/experimental";

function isDurableObjectNamespace(
	binding: unknown
): binding is DurableObjectNamespace {
	return (
		typeof binding === "object" &&
		binding !== null &&
		"idFromName" in binding &&
		typeof binding.idFromName === "function" &&
		"idFromString" in binding &&
		typeof binding.idFromString === "function" &&
		"get" in binding &&
		typeof binding.get === "function"
	);
}

function hasIntrospectSqliteMethod(
	stub: unknown
): stub is { [INTROSPECT_SQLITE_METHOD]: IntrospectSqliteMethod } {
	return (
		INTROSPECT_SQLITE_METHOD in (stub as object) &&
		typeof (stub as any)[INTROSPECT_SQLITE_METHOD] === "function"
	);
}

function getDurableObjectStub(
	env: Record<string, unknown>,
	scriptName: string,
	className: string,
	identifier: DurableObjectIdentifier
) {
	const bindingName = getDevControlDurableObjectBindingName(
		scriptName,
		className
	);
	const namespace = env[bindingName];

	if (!isDurableObjectNamespace(namespace)) {
		throw new TypeError(
			`Expected Durable Object namespace binding for ${scriptName}:${className}`
		);
	}

	const id =
		identifier.id === undefined
			? namespace.idFromName(identifier.name)
			: namespace.idFromString(identifier.id);

	return namespace.get(id);
}

export default class DevControl
	extends WorkerEntrypoint<Record<string, unknown>>
	implements DevControlInterface
{
	async evictDurableObject(
		scriptName: string,
		className: string,
		options: DurableObjectEvictionOptions
	): Promise<void> {
		const stub = getDurableObjectStub(this.env, scriptName, className, options);

		await workerdUnsafe.evict(stub, {
			webSockets: options.webSockets,
		});
	}

	async execDurableObjectSql<Row extends Record<string, SqlStorageValue>>(
		scriptName: string,
		className: string,
		options: DurableObjectStorageOperationOptions
	): Promise<Row[]> {
		const stub = getDurableObjectStub(this.env, scriptName, className, options);

		if (!hasIntrospectSqliteMethod(stub)) {
			throw new TypeError(
				`Durable Object ${scriptName}:${className} does not support SQLite introspection.`
			);
		}

		const [result] = await stub[INTROSPECT_SQLITE_METHOD]([
			{ sql: options.query, params: options.bindings },
		]);

		if (result === undefined) {
			throw new Error("Durable Object SQLite query did not return a result.");
		}

		const columns = result.columns ?? [];
		const rawRows = result.rows ?? [];
		const rows = rawRows.map((rawRow) => {
			return Object.fromEntries(
				columns.map((column, index) => [column, rawRow[index]])
			) as Row;
		});

		return rows;
	}
}
