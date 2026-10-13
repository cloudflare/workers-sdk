import { WorkerEntrypoint } from "cloudflare:workers";
import { SharedBindings, SharedHeaders } from "../shared/constants";
import { isD1ExportPragma, parseD1RpcExportResponse } from "./export";
import {
	D1RowsAndColumnsResponseSchema,
	D1RpcRequestSchema,
	D1_SESSION_COMMIT_TOKEN_HTTP_HEADER,
} from "./schemas";
import type { D1RpcExportResponse } from "./export";
import type { D1RpcRequest, D1RpcResponse } from "./schemas";

interface D1EntryProps {
	// The shared routing key holds this binding's database ID, not a DO namespace.
	[SharedBindings.TEXT_NAMESPACE]?: string;
}
interface D1EntryEnv {
	[SharedBindings.TEXT_NAMESPACE]?: string;
	// All local databases live in this namespace; the ID in props selects one.
	[SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT]: DurableObjectNamespace;
}

/** Routes D1 HTTP and RPC requests to the same local SQLite database. */
export default class D1Entry extends WorkerEntrypoint<
	D1EntryEnv,
	D1EntryProps
> {
	/** Preserves the HTTP protocol used by bindings without the RPC flag. */
	async fetch(request: Request): Promise<Response> {
		// Local Explorer addresses unbound databases through the internal header;
		// preserve the shared entry worker's props/binding/header precedence.
		const requestNamespace = request.headers.get(SharedHeaders.NAMESPACE);
		const name =
			this.ctx.props[SharedBindings.TEXT_NAMESPACE] ??
			this.env[SharedBindings.TEXT_NAMESPACE] ??
			requestNamespace;
		if (name === null) {
			throw new Error(
				"D1 entry worker: no database ID provided via props, binding, or request header"
			);
		}
		const namespace = this.env[SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT];
		const stub = namespace.get(namespace.idFromName(name));
		if (requestNamespace !== null) {
			const headers = new Headers(request.headers);
			headers.delete(SharedHeaders.NAMESPACE);
			request = new Request(request, { headers });
		}
		// The shared DO base uses this name to initialise its storage namespace.
		return await stub.fetch(request, { cf: { miniflare: { name } } });
	}

	/** Returns raw transactional results; query failures are thrown over RPC. */
	async query(
		request: D1RpcRequest
	): Promise<D1RpcResponse | D1RpcExportResponse> {
		const { queries, bookmark } = D1RpcRequestSchema.parse(request);
		const headers = new Headers({ "Content-Type": "application/json" });
		if (bookmark) {
			headers.set(D1_SESSION_COMMIT_TOKEN_HTTP_HEADER, bookmark);
		}

		// Reuse the HTTP execution path so transactions, validation, and metadata
		// remain owned by the database worker rather than duplicated for RPC.
		const response = await this.fetch(
			new Request("http://d1/query?resultsFormat=ROWS_AND_COLUMNS", {
				method: "POST",
				headers,
				body: JSON.stringify(queries),
			})
		);
		const responseBody: unknown = await response.json();
		if (isD1ExportPragma(queries)) {
			return parseD1RpcExportResponse(responseBody);
		}

		const body = D1RowsAndColumnsResponseSchema.parse(responseBody);
		if (!Array.isArray(body)) {
			const error = new Error(body.error);
			error.name = "D1_ERROR";
			throw error;
		}

		const result: D1RpcResponse = {
			results: body.map(({ meta, results }) => ({
				meta,
				data: { kind: "raw", ...results },
			})),
		};
		const responseBookmark = response.headers.get(
			D1_SESSION_COMMIT_TOKEN_HTTP_HEADER
		);
		if (responseBookmark) {
			result.bookmark = responseBookmark;
		}
		return result;
	}
}
