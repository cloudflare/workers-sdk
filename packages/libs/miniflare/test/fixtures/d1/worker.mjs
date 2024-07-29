/**
 * @typedef {Object} Statement
 * @property {string} sql
 * @property {any[] | undefined} params
 */

/**
 * @param {import("@cloudflare/workers-types/experimental").Request} request
 */
async function requestJson(request) {
	const text = await request.text();
	return JSON.parse(text, (key, value) => {
		if (typeof value === "object" && value !== null && "$type" in value) {
			if (value.$type === "Uint8Array") {
				return new Uint8Array(value.contents);
			}
		}
		return value;
	});
}

function reduceError(e) {
	return {
		name: e?.name,
		message: e?.message ?? String(e),
		stack: e?.stack,
		cause: e?.cause === undefined ? undefined : reduceError(e.cause),
	};
}

/**
 * @param {import("@cloudflare/workers-types/experimental").D1Database} db
 * @param {Statement} rawStmt
 * @returns {import("@cloudflare/workers-types/experimental").D1PreparedStatement}
 */
function prepareStatement(db, rawStmt) {
	let stmt = db.prepare(rawStmt.sql);
	if (rawStmt.params !== undefined) stmt = stmt.bind(...rawStmt.params);
	return stmt;
}

/**
 * @param {import("@cloudflare/workers-types/experimental").D1Database} db
 * @param {import("@cloudflare/workers-types/experimental").Request} request
 * @returns {Promise<import("@cloudflare/workers-types/experimental").D1PreparedStatement>}
 */
async function prepareStatementFromRequest(db, request) {
	/** @type {Statement} */
	const stmt = await requestJson(request);
	return prepareStatement(db, stmt);
}

/** @type {import("@cloudflare/workers-types/experimental").ExportedHandler<{DB: import("@cloudflare/workers-types/experimental").D1Database}>} */
const worker = {
	async fetch(request, env) {
		try {
			const { pathname } = new URL(request.url);
			if (pathname.startsWith("/prepare/first")) {
				let colName = pathname.substring("/prepare/first/".length);
				if (colName === "") colName = undefined;
				const stmt = await prepareStatementFromRequest(env.DB, request);
				return Response.json(await stmt.first(colName));
			} else if (pathname === "/prepare/run") {
				const stmt = await prepareStatementFromRequest(env.DB, request);
				return Response.json(await stmt.run());
			} else if (pathname === "/prepare/all") {
				const stmt = await prepareStatementFromRequest(env.DB, request);
				return Response.json(await stmt.all());
			} else if (pathname === "/prepare/raw") {
				const stmt = await prepareStatementFromRequest(env.DB, request);
				return Response.json(await stmt.raw());
			} else if (pathname === "/dump") {
				const buffer = await env.DB.dump();
				return new Response(buffer);
			} else if (pathname === "/batch") {
				/** @type {Statement[]} */
				const rawStmts = await requestJson(request);
				const stmts = rawStmts.map((stmt) => prepareStatement(env.DB, stmt));
				return Response.json(await env.DB.batch(stmts));
			} else if (pathname === "/exec") {
				const stmts = await request.text();
				return Response.json(await env.DB.exec(stmts));
			}
		} catch (e) {
			const error = reduceError(e);
			return Response.json(error, {
				status: 500,
				headers: { "MF-Experimental-Error-Stack": "true" },
			});
		}
	},
};

export default worker;
