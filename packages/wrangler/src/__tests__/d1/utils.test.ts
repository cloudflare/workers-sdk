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
		).rejects.toThrowError(
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
