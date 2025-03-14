// These will become default after read replication is open.
type D1DatabaseWithSessionsAPI = D1Database & {
	// constraintOrBookmark: "first-primary" | "first-unconstrained" | string
	withSession(constraintOrBookmark: string): D1DatabaseSession;
};

type D1DatabaseSession = Pick<D1Database, "prepare" | "batch"> & {
	getBookmark(): string;
};

export interface Env {
	DB01: D1DatabaseWithSessionsAPI;
}

export default {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);

		let bookmark = "first-primary";
		let q = "select 1;";

		if (url.pathname === "/sql") {
			bookmark = url.searchParams.get("bookmark");
			q = url.searchParams.get("q");
		}

		const session = env.DB01.withSession(bookmark);
		// Dummy select to get the bookmark before the main query.
		await session.prepare("select 1").all();
		const bookmarkBefore = session.getBookmark();
		// Now do the main query requested.
		const result = await session.prepare(q).all();
		const bookmarkAfter = session.getBookmark();

		return Response.json({
			bookmarkBefore,
			bookmarkAfter,
			result,
		});
	},
};
