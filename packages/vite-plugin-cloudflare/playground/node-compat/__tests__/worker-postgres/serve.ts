import { createMockPostgresServer } from "@fixture/shared/src/mock-postgres-server";
import { startDefaultServe } from "../../../vitest-setup";

let mockPg: Awaited<ReturnType<typeof createMockPostgresServer>>;

/**
 * Start a local mock Postgres server before the Vite dev server starts.
 * The mock port is passed to the worker via the vite config customizer
 * (see vite.config.worker-postgres.ts).
 */
export async function preServe() {
	mockPg = await createMockPostgresServer({
		rows: [{ id: "21", name: "mock-row" }],
	});
	// eslint-disable-next-line turbo/no-undeclared-env-vars
	process.env.MOCK_PG_PORT = String(mockPg.port);
}

export async function postServe() {
	await mockPg?.stop();
}

export async function serve() {
	return startDefaultServe();
}
