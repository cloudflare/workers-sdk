import { type Config } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import { describe, it } from "vitest";
import {
	getDatabaseByNameOrBinding,
	getDatabaseInfoFromConfig,
} from "../../d1/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { getMswSuccessMembershipHandlers, msw } from "../helpers/msw";

describe("getDatabaseInfoFromConfig", () => {
	it("should handle no database", ({ expect }) => {
		const config = {
			d1_databases: [],
		} as unknown as Config;
		expect(getDatabaseInfoFromConfig(config, "db")).toBeNull();
	});

	it("should handle no matching database", ({ expect }) => {
		const config = {
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		} as unknown as Config;
		expect(getDatabaseInfoFromConfig(config, "db2")).toBeNull();
	});

	it("should handle matching database", ({ expect }) => {
		const config = {
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		} as unknown as Config;
		expect(getDatabaseInfoFromConfig(config, "db")).toEqual({
			uuid: "xxxx",
			previewDatabaseUuid: undefined,
			binding: "DATABASE",
			migrationsTableName: "d1_migrations",
			name: "db",
			migrationsDirRaw: undefined,
			migrationsPattern: undefined,
			internal_env: undefined,
		});
	});

	it("should handle matching a database with a custom migrations folder", ({
		expect,
	}) => {
		const config = {
			d1_databases: [
				{
					binding: "DATABASE",
					database_name: "db",
					database_id: "xxxx",
					migrations_dir: "./custom_migrations",
				},
			],
		} as unknown as Config;
		expect(getDatabaseInfoFromConfig(config, "db")).toEqual({
			uuid: "xxxx",
			previewDatabaseUuid: undefined,
			binding: "DATABASE",
			migrationsTableName: "d1_migrations",
			name: "db",
			migrationsDirRaw: "./custom_migrations",
			migrationsPattern: undefined,
			internal_env: undefined,
		});
	});

	it("should handle matching a database with custom migrations table", ({
		expect,
	}) => {
		const config = {
			d1_databases: [
				{
					binding: "DATABASE",
					database_name: "db",
					database_id: "xxxx",
					migrations_table: "custom_migrations",
				},
			],
		} as unknown as Config;
		expect(getDatabaseInfoFromConfig(config, "db")).toEqual({
			uuid: "xxxx",
			previewDatabaseUuid: undefined,
			binding: "DATABASE",
			migrationsTableName: "custom_migrations",
			name: "db",
			migrationsDirRaw: undefined,
			migrationsPattern: undefined,
			internal_env: undefined,
		});
	});

	it("should handle matching a database when there are multiple databases", ({
		expect,
	}) => {
		const config = {
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				{ binding: "DATABASE2", database_name: "db2", database_id: "yyyy" },
			],
		} as unknown as Config;
		expect(getDatabaseInfoFromConfig(config, "db2")).toEqual({
			uuid: "yyyy",
			previewDatabaseUuid: undefined,
			binding: "DATABASE2",
			migrationsTableName: "d1_migrations",
			name: "db2",
			migrationsDirRaw: undefined,
			migrationsPattern: undefined,
			internal_env: undefined,
		});
	});
});

describe("getDatabaseByNameOrBinding", () => {
	mockAccountId({ accountId: null });
	mockApiToken();

	it("should handle no database", async ({ expect }) => {
		msw.use(
			...getMswSuccessMembershipHandlers([{ id: "IG-88", name: "enterprise" }]),
			http.get("*/accounts/:accountId/d1/database/:name", async () => {
				return HttpResponse.json(
					{ success: false, errors: [{ code: 7404, message: "Not Found" }] },
					{ status: 404 }
				);
			})
		);
		const config = {
			d1_databases: [],
		} as unknown as Config;
		await expect(
			getDatabaseByNameOrBinding(config, "123", "db")
		).rejects.toThrow(
			"Couldn't find a D1 DB with name or binding 'db' in your config or the API. Run 'wrangler d1 create db' to create it."
		);
	});

	it("should resolve a database by name via the D1 API", async ({ expect }) => {
		const uuid = "7b0c1d24-ec57-4179-8663-9b82dafe9277";
		msw.use(
			...getMswSuccessMembershipHandlers([{ id: "IG-88", name: "enterprise" }]),
			http.get("*/accounts/:accountId/d1/database/:name", async () => {
				return HttpResponse.json({
					result: { uuid, name: "db" },
					success: true,
					errors: [],
					messages: [],
				});
			})
		);
		const config = {
			d1_databases: [],
		} as unknown as Config;
		await expect(
			getDatabaseByNameOrBinding(config, "123", "db")
		).resolves.toStrictEqual({
			uuid,
			name: "db",
			binding: "db",
			migrationsTableName: "d1_migrations",
		});
	});

	it("should resolve an auto-provisioned binding (no database_id) via the D1 API", async ({
		expect,
	}) => {
		const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
		msw.use(
			...getMswSuccessMembershipHandlers([{ id: "IG-88", name: "enterprise" }]),
			http.get(
				"*/accounts/:accountId/d1/database/:name",
				async ({ params }) => {
					// Should be looked up by `database_name`, not by the binding.
					expect(params.name).toBe("my-database");
					return HttpResponse.json({
						result: { uuid, name: "my-database" },
						success: true,
						errors: [],
						messages: [],
					});
				}
			)
		);
		const config = {
			d1_databases: [
				{
					binding: "DB",
					database_name: "my-database",
					migrations_dir: "./migrations",
				},
			],
		} as unknown as Config;
		await expect(
			getDatabaseByNameOrBinding(config, "123", "DB")
		).resolves.toStrictEqual({
			uuid,
			name: "my-database",
			binding: "DB",
			migrationsTableName: "d1_migrations",
			migrationsDirRaw: "./migrations",
			migrationsPattern: undefined,
			previewDatabaseUuid: undefined,
			internal_env: undefined,
		});
	});

	it("resolves a binding-only config via the auto-provisioned name (worker name + binding)", async ({
		expect,
	}) => {
		const uuid = "c0ffee00-c0ffee00-c0ffee00-c0ffee000000";
		msw.use(
			...getMswSuccessMembershipHandlers([{ id: "IG-88", name: "enterprise" }]),
			http.get(
				"*/accounts/:accountId/d1/database/:name",
				async ({ params }) => {
					// Mirrors runProvisioningFlow's defaultName:
					// `${scriptName}-${binding.toLowerCase().replaceAll("_", "-")}`
					expect(params.name).toBe("my-worker-d1-binding-name");
					return HttpResponse.json({
						result: {
							uuid,
							name: params.name,
						},
						success: true,
						errors: [],
						messages: [],
					});
				}
			)
		);
		const config = {
			name: "my-worker",
			d1_databases: [
				{
					binding: "D1_BINDING_NAME",
				},
			],
		} as unknown as Config;
		await expect(
			getDatabaseByNameOrBinding(config, "123", "D1_BINDING_NAME")
		).resolves.toStrictEqual({
			binding: "D1_BINDING_NAME",
			name: "my-worker-d1-binding-name",
			uuid,
			migrationsTableName: "d1_migrations",
			migrationsDirRaw: undefined,
			migrationsPattern: undefined,
			previewDatabaseUuid: undefined,
			internal_env: undefined,
		});
	});

	it("does not silently bind to an unrelated DB with the same name as the binding", async ({
		expect,
	}) => {
		// Foot-gun guard: even though a DB literally named "DB" exists on the
		// account, the auto-provisioned name is `<worker>-db`, so we must look
		// for that and 404 — not bind to the unrelated "DB" database.
		msw.use(
			...getMswSuccessMembershipHandlers([{ id: "IG-88", name: "enterprise" }]),
			http.get(
				"*/accounts/:accountId/d1/database/:name",
				async ({ params }) => {
					expect(params.name).toBe("my-worker-db");
					return HttpResponse.json(
						{ success: false, errors: [{ code: 7404, message: "Not Found" }] },
						{ status: 404 }
					);
				}
			)
		);
		const config = {
			name: "my-worker",
			d1_databases: [{ binding: "DB" }],
		} as unknown as Config;
		await expect(
			getDatabaseByNameOrBinding(config, "123", "DB")
		).rejects.toThrow(
			"Couldn't find an auto-provisioned D1 DB named 'my-worker-db' for binding 'DB'. Run 'wrangler deploy' to provision it, or add 'database_name' / 'database_id' to your config."
		);
	});

	it("refuses to guess when binding has no database_name/id and worker has no name", async ({
		expect,
	}) => {
		// No HTTP handler — we want to confirm we never call out.
		const config = {
			d1_databases: [{ binding: "DB" }],
		} as unknown as Config;
		await expect(
			getDatabaseByNameOrBinding(config, "123", "DB")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`
			[Error: Found a database binding named 'DB' but it has no 'database_name' or 'database_id', and the worker has no 'name'.

			In order to connect to an existing database, please specify either 'database_name' or 'database_id' in the binding.

			Alternatively specify a 'name' for the worker and then run 'wrangler deploy'. This will auto-provision a database named '<worker-name>-db'.]
		`
		);
	});

	it("propagates non-404 API errors instead of masking them as not-found", async ({
		expect,
	}) => {
		msw.use(
			...getMswSuccessMembershipHandlers([{ id: "IG-88", name: "enterprise" }]),
			http.get("*/accounts/:accountId/d1/database/:name", async () => {
				return HttpResponse.json(
					{
						success: false,
						errors: [{ code: 10000, message: "Authentication error" }],
					},
					{ status: 401 }
				);
			})
		);
		const config = {
			d1_databases: [],
		} as unknown as Config;
		// Surface the underlying API failure verbatim instead of replacing
		// it with the "Couldn't find a D1 DB" UserError (which would only
		// be correct for a 404).
		await expect(
			getDatabaseByNameOrBinding(config, "123", "db")
		).rejects.toThrow(
			"A request to the Cloudflare API (/accounts/123/d1/database/db) failed."
		);
	});
});
