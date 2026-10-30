import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createClient, createConfig } from "./generated/client";
import * as sdk from "./generated/sdk.gen";
import type { Client } from "./generated/client";
import type {
	D1BatchQuery,
	LocalExplorerDoBinding,
	LocalExplorerResourceBinding,
	LocalExplorerWorker,
	LocalExplorerWorkflowBinding,
} from "./generated/types.gen";

const EXPLORER_API_PATH = "/cdn-cgi/local/explorer/api";
// Internal Miniflare header (`CoreHeaders.ROUTE_OVERRIDE`) that the entry
// worker uses to pick a target Worker. A real SDK would need this promoted to
// a supported contract, or a `/local/workers/:name/fetch` endpoint.
const ROUTE_OVERRIDE_HEADER = "MF-Route-Override";

type Row = Record<string, unknown>;

export type ExplorerClientOptions = {
	/** Custom fetch, e.g. to add headers or record timings. */
	fetch?: typeof globalThis.fetch;
};

/**
 * Creates a client for a running local Workers runtime, addressed only by
 * its URL. Everything goes over HTTP: the generated Local Explorer SDK for
 * resources and triggers, plus plain `fetch()` for the Worker itself.
 *
 * The caller can be a test in the same process, another process (e.g. a
 * Playwright worker), or an agent tool. It does not need a Miniflare
 * instance.
 *
 * @param url - Origin of the runtime (what `miniflare.ready` / `cf dev` prints).
 * @param clientOptions - Client options.
 * @returns The ergonomic client, with the raw generated SDK under `api`.
 */
export function createExplorerClient(
	url: string | URL,
	clientOptions: ExplorerClientOptions = {}
) {
	const origin = new URL(url);
	const fetchImpl = clientOptions.fetch ?? globalThis.fetch;
	const client: Client = createClient(
		createConfig({
			baseUrl: new URL(EXPLORER_API_PATH, origin).href,
			fetch: fetchImpl,
		})
	);
	let workersCache: Promise<LocalExplorerWorker[]> | undefined;

	function listWorkers(refresh = false): Promise<LocalExplorerWorker[]> {
		if (refresh || workersCache === undefined) {
			workersCache = sdk
				.localExplorerListWorkers({ client, throwOnError: true })
				.then(({ data }) => (data.result ?? []).filter((w) => w.isSelf));
			// Don't cache a failure
			workersCache.catch(() => {
				workersCache = undefined;
			});
		}
		return workersCache;
	}

	async function getWorkerInfo(name?: string): Promise<LocalExplorerWorker> {
		const workers = await listWorkers();
		const info =
			name === undefined ? workers[0] : workers.find((w) => w.name === name);
		if (info === undefined) {
			throw new TypeError(
				`Worker ${JSON.stringify(name)} does not exist in this runtime.`
			);
		}
		return info;
	}

	async function resolveBinding<
		K extends "kv" | "d1" | "r2" | "do" | "workflows",
	>(workerName: string | undefined, kind: K, bindingName: string) {
		const info = await getWorkerInfo(workerName);
		const bindings = (info.bindings?.[kind] ?? []) as Array<
			K extends "do"
				? LocalExplorerDoBinding
				: K extends "workflows"
					? LocalExplorerWorkflowBinding
					: LocalExplorerResourceBinding
		>;
		const binding = bindings.find((b) => b.bindingName === bindingName);
		if (binding === undefined) {
			throw new TypeError(
				`No ${kind} binding named ${JSON.stringify(bindingName)} found in ${JSON.stringify(info.name)} worker.`
			);
		}
		return binding;
	}

	function worker(name?: string) {
		return {
			/** Dispatches a fetch to this Worker over HTTP. */
			async fetch(input: string | URL, init?: RequestInit) {
				const request = new Request(new URL(input, origin), init);
				if (name !== undefined) {
					request.headers.set(ROUTE_OVERRIDE_HEADER, name);
				}
				return fetchImpl(request);
			},

			/** Dispatches a scheduled event to this Worker. */
			async scheduled(event: { cron: string; scheduledTime?: Date }) {
				const workerName = (await getWorkerInfo(name)).name;
				const { data } = await sdk.localExplorerDispatchScheduled({
					client,
					throwOnError: true,
					query: { worker: workerName },
					body: {
						cron: event.cron,
						scheduled_time: event.scheduledTime?.getTime(),
					},
				});
				return data.result;
			},

			kv(bindingName: string) {
				const id = () =>
					resolveBinding(name, "kv", bindingName).then((b) => b.id);
				return {
					async get(key: string): Promise<string | null> {
						const { data, response } =
							await sdk.workersKvNamespaceReadKeyValuePair({
								client,
								path: { namespace_id: await id(), key_name: key },
								parseAs: "text",
							});
						if (response.status === 404) {
							return null;
						}
						if (!response.ok) {
							throw new Error(
								`KV get failed: ${response.status} ${response.statusText}`
							);
						}
						return data as string;
					},
					async put(key: string, value: string): Promise<void> {
						await sdk.workersKvNamespaceWriteKeyValuePairWithMetadata({
							client,
							throwOnError: true,
							path: { namespace_id: await id(), key_name: key },
							body: value,
						});
					},
					async list(prefix?: string): Promise<string[]> {
						const { data } = await sdk.workersKvNamespaceListANamespace_SKeys({
							client,
							throwOnError: true,
							path: { namespace_id: await id() },
							query: { prefix },
						});
						return (data.result ?? []).map((key) => key.name);
					},
				};
			},

			d1(bindingName: string) {
				const id = () =>
					resolveBinding(name, "d1", bindingName).then((b) => b.id);
				/** Runs one statement and returns rows as objects. */
				async function query<T extends Row = Row>(
					sql: string,
					...params: unknown[]
				): Promise<T[]> {
					const { data } = await sdk.d1RawDatabaseQuery({
						client,
						throwOnError: true,
						path: { database_id: await id() },
						body: { sql, params: params as string[] },
					});
					const results = data.result?.[0]?.results;
					return toObjects(results?.columns, results?.rows) as T[];
				}
				return {
					query,
					/**
					 * Applies `.sql` files from `dir` that haven't run yet, like
					 * `cf d1 migrations apply --dir`. Bookkeeping uses the same table
					 * shape as wrangler and cf. Files are read by this process.
					 */
					async applyMigrations(
						options: { dir?: string; table?: string } = {}
					): Promise<string[]> {
						const dir = path.resolve(options.dir ?? "migrations");
						const table = options.table ?? "d1_migrations";
						if (!/^\w+$/.test(table)) {
							throw new TypeError(`Invalid migrations table name: ${table}`);
						}
						const databaseId = await id();
						const run = (body: D1BatchQuery) =>
							sdk.d1RawDatabaseQuery({
								client,
								throwOnError: true,
								path: { database_id: databaseId },
								body,
							});
						await run({
							sql: `CREATE TABLE IF NOT EXISTS ${table} (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
						});
						const applied = new Set(
							(await query<{ name: string }>(`SELECT name FROM ${table}`)).map(
								(row) => row.name
							)
						);
						const pending = (await fs.readdir(dir))
							.filter((file) => file.endsWith(".sql") && !applied.has(file))
							.sort();
						for (const file of pending) {
							await run({
								batch: [
									{ sql: await fs.readFile(path.join(dir, file), "utf8") },
									{
										sql: `INSERT INTO ${table} (name) VALUES (?)`,
										params: [file],
									},
								],
							});
						}
						return pending;
					},
				};
			},

			durableObject(bindingName: string) {
				const binding = () => resolveBinding(name, "do", bindingName);
				return {
					/** IDs of objects with persisted storage. */
					async listIds(): Promise<string[]> {
						const { data } = await sdk.durableObjectsNamespaceListObjects({
							client,
							throwOnError: true,
							path: { id: (await binding()).id },
						});
						return (data.result ?? []).map((object) => object.id ?? "");
					},
					/** Runs SQL inside a live SQLite-backed object. */
					async sql<T extends Row = Row>(
						target: { name: string } | { id: string },
						sql: string,
						...params: unknown[]
					): Promise<T[]> {
						const queries = [{ sql, params }];
						const { data } = await sdk.durableObjectsNamespaceQuerySqlite({
							client,
							throwOnError: true,
							path: { namespace_id: (await binding()).id },
							body:
								"name" in target
									? { durable_object_name: target.name, queries }
									: { durable_object_id: target.id, queries },
						});
						const result = data.result?.[0];
						return toObjects(result?.columns, result?.rows) as T[];
					},
					/**
					 * Evicts a running object while keeping its storage. One of the
					 * operations only `createTestHarness` had; added to the Explorer.
					 */
					async evict(
						target: { name: string } | { id: string },
						options: { webSockets?: "close" | "hibernate" } = {}
					): Promise<void> {
						await sdk.durableObjectsNamespaceEvictObject({
							client,
							throwOnError: true,
							path: { namespace_id: (await binding()).id },
							body: {
								...("name" in target
									? { durable_object_name: target.name }
									: { durable_object_id: target.id }),
								web_sockets: options.webSockets,
							},
						});
					},
				};
			},
		};
	}

	return {
		/** The raw generated client and operations, for anything not wrapped. */
		api: { client, ...sdk },
		listWorkers,
		worker,
		/** Shorthand for `worker().fetch()` on the entry Worker. */
		fetch: (input: string | URL, init?: RequestInit) =>
			worker().fetch(input, init),
	};
}

export type ExplorerClient = ReturnType<typeof createExplorerClient>;

function toObjects(
	columns: string[] | undefined,
	rows: unknown[][] | undefined
): Row[] {
	if (columns === undefined || rows === undefined) {
		return [];
	}
	return rows.map((row) =>
		Object.fromEntries(columns.map((column, index) => [column, row[index]]))
	);
}
