import { type Config } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import {
	getDatabaseByNameOrBinding,
	getDatabaseInfoFromConfig,
} from "../../commands/d1/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockGetMemberships } from "../helpers/mock-oauth-flow";
import { msw } from "../helpers/msw";

describe("getDatabaseInfoFromConfig", () => {
	it("should handle no database", () => {
		const config = {
			d1_databases: [],
		} as unknown as Config;
		expect(getDatabaseInfoFromConfig(config, "db")).toBeNull();
	});

	it("should handle no matching database", () => {
		const config = {
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		} as unknown as Config;
		expect(getDatabaseInfoFromConfig(config, "db2")).toBeNull();
	});

	it("should handle matching database", () => {
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
			migrationsFolderPath: "./migrations",
			internal_env: undefined,
		});
	});

	it("should handle matching a database with a custom migrations folder", () => {
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
			migrationsFolderPath: "./custom_migrations",
			internal_env: undefined,
		});
	});

	it("should handle matching a database with custom migrations table", () => {
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
			migrationsFolderPath: "./migrations",
			internal_env: undefined,
		});
	});

	it("should handle matching a database when there are multiple databases", () => {
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
			migrationsFolderPath: "./migrations",
			internal_env: undefined,
		});
	});
});

describe("getDatabaseByNameOrBinding", () => {
	mockAccountId({ accountId: null });
	mockApiToken();

	it("should handle no database", async () => {
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		msw.use(
			http.get("*/accounts/:accountId/d1/database", async () => {
				return HttpResponse.json(
					{
						result: [
							{
								file_size: 7421952,
								name: "benchmark3-v1",
								num_tables: 2,
								uuid: "7b0c1d24-ec57-4179-8663-9b82dafe9277",
								version: "alpha",
							},
						],
						success: true,
						errors: [],
						messages: [],
					},
					{ status: 200 }
				);
			})
		);
		const config = {
			d1_databases: [],
		} as unknown as Config;
		await expect(
			getDatabaseByNameOrBinding(config, "123", "db")
		).rejects.toThrowError("Couldn't find DB with name 'db'");
	});

	it("should handle a matching database", async () => {
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		const mockDb = {
			file_size: 7421952,
			name: "db",
			num_tables: 2,
			uuid: "7b0c1d24-ec57-4179-8663-9b82dafe9277",
			version: "alpha",
		};
		msw.use(
			http.get("*/accounts/:accountId/d1/database", async () => {
				return HttpResponse.json(
					{
						result: [mockDb],
						success: true,
						errors: [],
						messages: [],
					},
					{ status: 200 }
				);
			})
		);
		const config = {
			d1_databases: [],
		} as unknown as Config;
		await expect(
			getDatabaseByNameOrBinding(config, "123", "db")
		).resolves.toStrictEqual(mockDb);
	});
});
