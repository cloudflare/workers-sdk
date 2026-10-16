import { SharedHeaders } from "../../shared/constants";
import { aggregateListResults } from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import type { AppContext } from "../common";
import type {
	D1DatabaseResponse,
	D1RawResultResponse,
	D1SingleQuery,
} from "../generated";
import type {
	zD1ListDatabasesData,
	zD1RawDatabaseQueryData,
} from "../generated/zod.gen";
import type { z } from "zod";

interface D1FailureResponse {
	success: false;
	error: string;
}

/**
 * Get local D1 databases from the binding map.
 */
function getLocalD1Databases(env: AppContext["env"]): D1DatabaseResponse[] {
	const d1BindingMap = env.LOCAL_EXPLORER_BINDING_MAP.d1;

	return Object.entries(d1BindingMap).map(([id, bindingName]) => {
		const parts = bindingName.split(":");
		const databaseName = parts.pop() || bindingName;

		return {
			name: databaseName,
			uuid: id,
			version: "production",
		} satisfies D1DatabaseResponse;
	});
}

type ListDatabasesQuery = z.output<
	ReturnType<typeof zD1ListDatabasesData.shape.query.unwrap>
>;

/**
 * Lists local D1 databases and databases configured by shared-storage peers.
 */
export async function listD1Databases(
	c: AppContext,
	query: ListDatabasesQuery
): Promise<Response> {
	const { name } = query;

	const localDatabases = getLocalD1Databases(c.env);
	let allDatabases = await aggregateListResults(
		c,
		localDatabases,
		"/d1/database",
		{ getKey: (database) => database.uuid, sharedStorageOnly: true }
	);

	if (name) {
		allDatabases = allDatabases.filter((db) =>
			db.name?.toLowerCase().includes(name.toLowerCase())
		);
	}

	return c.json({
		...wrapResponse(allDatabases),
		result_info: {
			count: allDatabases.length,
		},
	});
}

type RawDatabaseBody = z.output<typeof zD1RawDatabaseQueryData.shape.body>;

/**
 * Executes raw SQL queries using the internal HTTP interface consumed by the
 * workerd D1 binding.
 */
export async function rawD1Database(
	c: AppContext,
	databaseId: string,
	body: RawDatabaseBody
): Promise<Response> {
	const queries: D1SingleQuery[] =
		"batch" in body && body.batch ? body.batch : [body as D1SingleQuery];
	const url = new URL("http://d1/query");
	url.searchParams.set("resultsFormat", "ROWS_AND_COLUMNS");
	const response = await c.env.MINIFLARE_D1.fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			[SharedHeaders.NAMESPACE]: databaseId,
		},
		body: JSON.stringify(queries.length === 1 ? queries[0] : queries),
	});

	if (!response.ok) {
		const body = await response.text();
		let message = response.statusText || "Internal D1 request failed";
		try {
			const error = JSON.parse(body) as D1FailureResponse;
			message = error.error || message;
		} catch {
			message = body || message;
		}
		return errorResponse(response.status, 10001, message);
	}

	const results = (await response.json()) as
		| D1RawResultResponse[]
		| D1FailureResponse;
	if (!Array.isArray(results)) {
		return errorResponse(500, 10001, results.error);
	}
	return c.json(wrapResponse(results));
}
