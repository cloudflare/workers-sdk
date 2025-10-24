import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { mockLegacyScriptData } from "./helpers/mock-legacy-script";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWranglerConfig } from "./helpers/write-wrangler-config";

describe("wrangler check do-migrations", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		setIsTTY(true);
	});

	test("it can list a pending DO migration", async () => {
		writeWranglerConfig({
			durable_objects: {
				bindings: [
					{ name: "SOMENAME", class_name: "SomeClass" },
					{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
				],
			},
			migrations: [
				{ tag: "v1", new_classes: ["SomeClass"] },
				{ tag: "v2", new_classes: ["SomeOtherClass"] },
			],
		});
		mockLegacyScriptData({
			scripts: [{ id: "test-name", migration_tag: "v1" }],
		});

		await runWrangler("check do-migrations");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			┌─┬─┬─┬─┐
			│ New Classes │ New SQLite Classes │ Renamed Classes │ Deleted Classes │
			├─┼─┼─┼─┤
			│ SomeOtherClass │ │ │ │
			└─┴─┴─┴─┘"
		`);
	});

	test("it can list multiple pending DO migrations", async () => {
		writeWranglerConfig({
			durable_objects: {
				bindings: [
                    { name: "SOMESQLITENAME", class_name: "SomeSQLiteClass" },
                    { name: "THATOTHERNAME", class_name: "ThatOtherClass"},
				],
			},
			migrations: [
				{ tag: "v1", new_classes: ["SomeClass"] },
				{ tag: "v2", new_classes: ["SomeOtherClass"] },
                { tag: "v3", new_classes: ["ThisOtherClass"], new_sqlite_classes: ["SomeSQLiteClass"] },
                { tag: "v4", deleted_classes: ["SomeClass", "SomeOtherClass"], renamed_classes: [ {from: "ThisOtherClass", to: "ThatOtherClass" }]}
			],
		});
		mockLegacyScriptData({
			scripts: [{ id: "test-name", migration_tag: "v2" }],
		});

		await runWrangler("check do-migrations");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			┌─┬─┬─┬─┐
			│ New Classes │ New SQLite Classes │ Renamed Classes │ Deleted Classes │
			├─┼─┼─┼─┤
			│ ThisOtherClass │ SomeSQLiteClass │ │ │
			├─┼─┼─┼─┤
			│ │ │ ThisOtherClass to ThatOtherClass │ SomeClass │
			│ │ │ │ SomeOtherClass │
			└─┴─┴─┴─┘"
		`);
	});

	test("it can no pending DO migrations", async () => {
		writeWranglerConfig({
			durable_objects: {
				bindings: [
                    { name: "SOMESQLITENAME", class_name: "SomeSQLiteClass" },
                    { name: "THATOTHERNAME", class_name: "ThatOtherClass"},
				],
			},
			migrations: [
				{ tag: "v1", new_classes: ["SomeClass"] },
				{ tag: "v2", new_classes: ["SomeOtherClass"] },
                { tag: "v3", new_classes: ["ThisOtherClass"], new_sqlite_classes: ["SomeSQLiteClass"] },
                { tag: "v4", deleted_classes: ["SomeClass", "SomeOtherClass"], renamed_classes: [ {from: "ThisOtherClass", to: "ThatOtherClass" }]}
			],
		});
		mockLegacyScriptData({
			scripts: [{ id: "test-name", migration_tag: "v4" }],
		});

		await runWrangler("check do-migrations");
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			No DO migrations pending for this worker"
		`);
	});

	test("it can list a pending DO migration (json)", async () => {
		writeWranglerConfig({
			durable_objects: {
				bindings: [
					{ name: "SOMENAME", class_name: "SomeClass" },
					{ name: "SOMEOTHERNAME", class_name: "SomeOtherClass" },
				],
			},
			migrations: [
				{ tag: "v1", new_classes: ["SomeClass"] },
				{ tag: "v2", new_classes: ["SomeOtherClass"] },
			],
		});
		mockLegacyScriptData({
			scripts: [{ id: "test-name", migration_tag: "v1" }],
		});

		await runWrangler("check do-migrations --json");
		expect(std.out).toMatchInlineSnapshot(`
			"[
			    {
			        \\"new_classes\\": [
			            \\"SomeOtherClass\\"
			        ]
			    }
			]"
		`);
	});

	test("it can list multiple pending DO migrations (json)", async () => {
		writeWranglerConfig({
			durable_objects: {
				bindings: [
                    { name: "SOMESQLITENAME", class_name: "SomeSQLiteClass" },
                    { name: "THATOTHERNAME", class_name: "ThatOtherClass"},
				],
			},
			migrations: [
				{ tag: "v1", new_classes: ["SomeClass"] },
				{ tag: "v2", new_classes: ["SomeOtherClass"] },
                { tag: "v3", new_classes: ["ThisOtherClass"], new_sqlite_classes: ["SomeSQLiteClass"] },
                { tag: "v4", deleted_classes: ["SomeClass", "SomeOtherClass"], renamed_classes: [ {from: "ThisOtherClass", to: "ThatOtherClass" }]}
			],
		});
		mockLegacyScriptData({
			scripts: [{ id: "test-name", migration_tag: "v2" }],
		});

		await runWrangler("check do-migrations --json");
		expect(std.out).toMatchInlineSnapshot(`
			"[
			    {
			        \\"new_classes\\": [
			            \\"ThisOtherClass\\"
			        ],
			        \\"new_sqlite_classes\\": [
			            \\"SomeSQLiteClass\\"
			        ]
			    },
			    {
			        \\"deleted_classes\\": [
			            \\"SomeClass\\",
			            \\"SomeOtherClass\\"
			        ],
			        \\"renamed_classes\\": [
			            {
			                \\"from\\": \\"ThisOtherClass\\",
			                \\"to\\": \\"ThatOtherClass\\"
			            }
			        ]
			    }
			]"
		`);
	});

	test("it can no pending DO migrations (json)", async () => {
		writeWranglerConfig({
			durable_objects: {
				bindings: [
                    { name: "SOMESQLITENAME", class_name: "SomeSQLiteClass" },
                    { name: "THATOTHERNAME", class_name: "ThatOtherClass"},
				],
			},
			migrations: [
				{ tag: "v1", new_classes: ["SomeClass"] },
				{ tag: "v2", new_classes: ["SomeOtherClass"] },
                { tag: "v3", new_classes: ["ThisOtherClass"], new_sqlite_classes: ["SomeSQLiteClass"] },
                { tag: "v4", deleted_classes: ["SomeClass", "SomeOtherClass"], renamed_classes: [ {from: "ThisOtherClass", to: "ThatOtherClass" }]}
			],
		});
		mockLegacyScriptData({
			scripts: [{ id: "test-name", migration_tag: "v4" }],
		});

		await runWrangler("check do-migrations --json");
		expect(std.out).toMatchInlineSnapshot(`"[]"`);
	});
});
