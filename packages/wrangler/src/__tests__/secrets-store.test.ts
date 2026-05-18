import {
	mockCreateDate,
	mockModifiedDate,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm, mockPrompt } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type {
	CreateSecret,
	CreateStore,
	UpdateSecret,
} from "../secrets-store/client";

describe("secrets-store help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("shows help text when no arguments are passed", async ({ expect }) => {
		await runWrangler("secrets-store");
		await endEventLoop();

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler secrets-store

			🔐 Manage the Secrets Store [open beta]

			COMMANDS
			  wrangler secrets-store store   🔐 Manage Stores within the Secrets Store [open beta]
			  wrangler secrets-store secret  🔐 Manage Secrets within the Secrets Store [open beta]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("shows help when an invalid argument is passed", async ({ expect }) => {
		await expect(() => runWrangler("secrets-store qwer")).rejects.toThrow(
			"Unknown argument: qwer"
		);

		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: qwer[0m

		"
	`);
		expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler secrets-store

			🔐 Manage the Secrets Store [open beta]

			COMMANDS
			  wrangler secrets-store store   🔐 Manage Stores within the Secrets Store [open beta]
			  wrangler secrets-store secret  🔐 Manage Secrets within the Secrets Store [open beta]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});
});

describe("secrets-store store commands", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	const std = mockConsoleMethods();

	beforeEach(() => {
		// @ts-expect-error we're using a very simple setTimeout mock here
		vi.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
			setImmediate(fn);
		});
		setIsTTY(true);
	});

	afterEach(() => {
		clearDialogs();
	});

	describe("secrets-store store create", () => {
		it("creates a store", async ({ expect }) => {
			const reqProm = mockStoreCreate();
			await runWrangler("secrets-store store create test-store --remote");

			await expect(reqProm).resolves.toMatchInlineSnapshot(`
				{
				  "name": "test-store",
				}
			`);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🔐 Creating store... (Name: test-store)
				✅ Created store! (Name: test-store, ID: 8b9199cad1954bc39add51c948767679)"
			`);
		});

		it("errors in creating a store when no name passed", async ({ expect }) => {
			let err: undefined | Error;
			try {
				await runWrangler("secrets-store store create --remote");
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Not enough non-option arguments: got 0, need at least 1"
			`);
		});
	});

	describe("secrets-store store list", () => {
		it("lists stores", async ({ expect }) => {
			mockStoreList();
			await runWrangler("secrets-store store list --remote");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🔐 Listing stores...
				┌─┬─┬─┬─┬─┐
				│ Name │ ID │ AccountID │ Created │ Modified │
				├─┼─┼─┼─┼─┤
				│ other-store │ 8686c49f762447988c02fd472f1fa82d │ 1b3ea6aa53af9903d51524c75900323a │ [mock-create-date] │ [mock-modified-date] │
				├─┼─┼─┼─┼─┤
				│ test-store │ 8686c49f762447988c02fd472f1fa82c │ 1b3ea6aa53af9903d51524c75900323a │ [mock-create-date] │ [mock-modified-date] │
				└─┴─┴─┴─┴─┘"
			`);
		});

		it("handles an empty response of stores", async ({ expect }) => {
			mockStoreListEmpty();

			let err: undefined | Error;
			try {
				await runWrangler("secrets-store store list --remote");
			} catch (e) {
				err = e as Error;
			}

			expect(err?.message).toMatchInlineSnapshot(`
        "List request returned no stores."
      `);
		});
	});
});

describe("secrets-store secret commands", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	const std = mockConsoleMethods();

	beforeEach(() => {
		// @ts-expect-error we're using a very simple setTimeout mock here
		vi.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
			setImmediate(fn);
		});
		setIsTTY(true);
	});

	afterEach(() => {
		clearDialogs();
	});

	describe("secrets-store secret create", () => {
		it("creates a secret", async ({ expect }) => {
			const reqProm = mockSecretCreate();

			mockPrompt({
				text: "Enter a secret value:",
				options: { isSecret: true },
				result: `shhhhhhh!`,
			});

			await runWrangler(
				"secrets-store secret create " +
					"850e0805c1084551bb46d150b5dfe414 " +
					"--name TEST_SECRET " +
					"--scopes 'workers' " +
					"--comment 'wrangler secret' " +
					"--remote"
			);

			await expect(reqProm).resolves.toMatchInlineSnapshot(`
				[
				  {
				    "comment": "wrangler secret",
				    "name": "TEST_SECRET",
				    "scopes": [
				      "workers",
				    ],
				    "value": "shhhhhhh!",
				  },
				]
			`);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────

				🔐 Creating secret... (Name: TEST_SECRET, Value: REDACTED, Scopes: workers, Comment: wrangler secret)
				✅ Created secret! (ID: 36dabbe4d01c49de82847b9a22673cbd)
				┌─┬─┬─┬─┬─┬─┬─┬─┐
				│ Name │ ID │ StoreID │ Comment │ Scopes │ Status │ Created │ Modified │
				├─┼─┼─┼─┼─┼─┼─┼─┤
				│ TEST_SECRET │ 36dabbe4d01c49de82847b9a22673cbd │ 850e0805c1084551bb46d150b5dfe414 │ wrangler secret │ workers │ pending │ [mock-create-date] │ [mock-modified-date] │
				└─┴─┴─┴─┴─┴─┴─┴─┘"
			`);
		});

		it("errors in creating a secret when no store-id passed", async ({
			expect,
		}) => {
			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret create " +
						"--name TEST_SECRET " +
						"--value 'shhhhhhh!' " +
						"--scopes 'workers' " +
						"--comment 'wrangler secret' " +
						"--remote"
				);
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Not enough non-option arguments: got 0, need at least 1"
			`);
		});

		it("errors in creating a secret when no name passed", async ({
			expect,
		}) => {
			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret create " +
						"850e0805c1084551bb46d150b5dfe414 " +
						"--value 'shhhhhhh!' " +
						"--scopes 'workers' " +
						"--comment 'wrangler secret' " +
						"--remote"
				);
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Missing required argument: name"
			`);
		});

		it("errors in creating a secret when no value passed", async ({
			expect,
		}) => {
			mockPrompt({
				text: "Enter a secret value:",
				options: { isSecret: true },
				result: ``,
			});

			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret create " +
						"850e0805c1084551bb46d150b5dfe414 " +
						"--name TEST_SECRET " +
						"--scopes 'workers' " +
						"--comment 'wrangler secret' " +
						"--remote"
				);
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Need to pass in a value when creating a secret."
			`);
		});

		it("errors in creating a secret when no scopes passed", async ({
			expect,
		}) => {
			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret create " +
						"850e0805c1084551bb46d150b5dfe414 " +
						"--name TEST_SECRET " +
						"--value 'shhhhhhh!' " +
						"--comment 'wrangler secret' " +
						"--remote"
				);
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Missing required argument: scopes"
			`);
		});
	});

	describe("secrets-store secret list", () => {
		it("lists secrets", async ({ expect }) => {
			mockSecretList();
			await runWrangler(
				"secrets-store secret list 850e0805c1084551bb46d150b5dfe414 --remote"
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🔐 Listing secrets... (store-id: 850e0805c1084551bb46d150b5dfe414, page: 1, per-page: 10)
				┌─┬─┬─┬─┬─┬─┬─┐
				│ Name │ ID │ Comment │ Scopes │ Status │ Created │ Modified │
				├─┼─┼─┼─┼─┼─┼─┤
				│ SECRET_KEY │ 8b108ac1cf244f91a17964f585ffa707 │ Key for Algolia search indexing │ workers │ active │ [mock-create-date] │ [mock-modified-date] │
				├─┼─┼─┼─┼─┼─┼─┤
				│ API_KEY │ 2821af4e600a446f87af4e9944b693c3 │ Key for DigitalOcean droplets │ workers │ active │ [mock-create-date] │ [mock-modified-date] │
				├─┼─┼─┼─┼─┼─┼─┤
				│ DB_KEY │ df3f6eb1159a4f10ac5fe836e2b8169c │ Key for PostgreSQL database │ workers │ active │ [mock-create-date] │ [mock-modified-date] │
				└─┴─┴─┴─┴─┴─┴─┘"
			`);
		});

		it("handles empty response of secrets", async ({ expect }) => {
			mockSecretListEmpty();
			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret list 850e0805c1084551bb46d150b5dfe414 --remote"
				);
			} catch (e) {
				err = e as Error;
			}

			expect(err?.message).toMatchInlineSnapshot(
				`"List request returned no secrets."`
			);
		});

		it("errors in listing secrets when no store-id passed", async ({
			expect,
		}) => {
			let err: undefined | Error;
			try {
				await runWrangler("secrets-store secret list --remote");
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Not enough non-option arguments: got 0, need at least 1"
			`);
		});
	});

	describe("secrets-store secret get", () => {
		it("gets a secret", async ({ expect }) => {
			mockSecretGet();
			await runWrangler(
				"secrets-store secret get 850e0805c1084551bb46d150b5dfe414 --secret-id df3f6eb1159a4f10ac5fe836e2b8169c --remote"
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🔐 Getting secret... (ID: df3f6eb1159a4f10ac5fe836e2b8169c)
				┌─┬─┬─┬─┬─┬─┬─┬─┐
				│ Name │ ID │ StoreID │ Comment │ Scopes │ Status │ Created │ Modified │
				├─┼─┼─┼─┼─┼─┼─┼─┤
				│ DB_KEY │ df3f6eb1159a4f10ac5fe836e2b8169c │ 850e0805c1084551bb46d150b5dfe414 │ Key for PostgreSQL database │ workers │ active │ [mock-create-date] │ [mock-modified-date] │
				└─┴─┴─┴─┴─┴─┴─┴─┘"
			`);
		});

		it("errors in getting a secret when no store-id passed", async ({
			expect,
		}) => {
			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret get --secret-id df3f6eb1159a4f10ac5fe836e2b8169c --remote"
				);
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Not enough non-option arguments: got 0, need at least 1"
			`);
		});

		it("errors in getting a secret when no secret-id passed", async ({
			expect,
		}) => {
			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret get 850e0805c1084551bb46d150b5dfe414 --remote"
				);
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Missing required argument: secret-id"
			`);
		});
	});

	describe("secrets-store secret delete", () => {
		it("deletes a secret", async ({ expect }) => {
			mockSecretDelete();
			await runWrangler(
				"secrets-store secret delete 850e0805c1084551bb46d150b5dfe414 --secret-id df3f6eb1159a4f10ac5fe836e2b8169c --remote"
			);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🔐 Deleting secret... (ID: df3f6eb1159a4f10ac5fe836e2b8169c)
				✅ Deleted secret! (ID: df3f6eb1159a4f10ac5fe836e2b8169c)"
			`);
		});

		it("errors in deleting a secret when no store-id passed", async ({
			expect,
		}) => {
			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret delete --secret-id df3f6eb1159a4f10ac5fe836e2b8169c --remote"
				);
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Not enough non-option arguments: got 0, need at least 1"
			`);
		});

		it("errors in deleting a secret when no secret-id passed", async ({
			expect,
		}) => {
			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret delete 850e0805c1084551bb46d150b5dfe414 --remote"
				);
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Missing required argument: secret-id"
			`);
		});
	});

	describe("secrets-store secret update", () => {
		it("updates a secret", async ({ expect }) => {
			mockConfirm({
				text: "Do you want to update the secret value?",
				result: true,
			});

			mockPrompt({
				text: "Enter a secret value:",
				options: { isSecret: true },
				result: `shhhhhhh!`,
			});

			const reqProm = mockSecretUpdate();

			await runWrangler(
				"secrets-store secret update " +
					"850e0805c1084551bb46d150b5dfe414 " +
					"--secret-id df3f6eb1159a4f10ac5fe836e2b8169c " +
					"--scopes 'workers' " +
					"--comment 'wrangler secret update' " +
					"--remote"
			);

			await expect(reqProm).resolves.toMatchInlineSnapshot(`
				{
				  "comment": "wrangler secret update",
				  "scopes": [
				    "workers",
				  ],
				  "value": "shhhhhhh!",
				}
			`);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🔐 Updating secret... (ID: df3f6eb1159a4f10ac5fe836e2b8169c)
				✅ Updated secret! (ID: 36dabbe4d01c49de82847b9a22673cbd)
				┌─┬─┬─┬─┬─┬─┬─┬─┐
				│ Name │ ID │ StoreID │ Comment │ Scopes │ Status │ Created │ Modified │
				├─┼─┼─┼─┼─┼─┼─┼─┤
				│ DB_KEY │ 36dabbe4d01c49de82847b9a22673cbd │ 850e0805c1084551bb46d150b5dfe414 │ wrangler secret update │ workers │ pending │ [mock-create-date] │ [mock-modified-date] │
				└─┴─┴─┴─┴─┴─┴─┴─┘"
			`);
		});

		it("errors in updating a secret when no store-id passed", async ({
			expect,
		}) => {
			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret update --secret-id df3f6eb1159a4f10ac5fe836e2b8169c " +
						"--name TEST_SECRET " +
						"--value 'shhhhhhh!' " +
						"--scopes 'workers' " +
						"--comment 'wrangler secret' " +
						"--remote"
				);
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Not enough non-option arguments: got 0, need at least 1"
			`);
		});

		it("errors in updating a secret when no secret-id passed", async ({
			expect,
		}) => {
			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret update " +
						"850e0805c1084551bb46d150b5dfe414 " +
						"--value 'shhhhhhh!' " +
						"--scopes 'workers' " +
						"--comment 'wrangler secret' " +
						"--remote"
				);
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Missing required argument: secret-id"
			`);
		});

		it("errors in updating a secret when no params to update are passed", async ({
			expect,
		}) => {
			mockConfirm({
				text: "Do you want to update the secret value?",
				result: true,
			});

			mockPrompt({
				text: "Enter a secret value:",
				options: { isSecret: true },
				result: ``,
			});

			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret update " +
						"850e0805c1084551bb46d150b5dfe414 " +
						"--secret-id df3f6eb1159a4f10ac5fe836e2b8169c " +
						"--remote"
				);
			} catch (e) {
				err = e as Error;
			}

			expect(err?.message).toMatchInlineSnapshot(
				`"Need to pass in a new field using \`--value\`, \`--scopes\`, or \`--comment\` to update a secret."`
			);
		});
	});

	describe("secrets-store secret duplicate", () => {
		it("duplicates a secret", async ({ expect }) => {
			const reqProm = mockSecretDuplicate();
			await runWrangler(
				"secrets-store secret duplicate " +
					"850e0805c1084551bb46d150b5dfe414 " +
					"--secret-id df3f6eb1159a4f10ac5fe836e2b8169c " +
					"--name DUPLICATE_KEY " +
					"--scopes 'workers' " +
					"--comment 'wrangler secret update' " +
					"--remote"
			);

			await expect(reqProm).resolves.toMatchInlineSnapshot(`
				{
				  "comment": "wrangler secret update",
				  "name": "DUPLICATE_KEY",
				  "scopes": [
				    "workers",
				  ],
				}
			`);

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🔐 Duplicating secret... (ID: df3f6eb1159a4f10ac5fe836e2b8169c)
				✅ Duplicated secret! (ID: 36dabbe4d01c49de82847b9a22673cbd)
				┌─┬─┬─┬─┬─┬─┬─┬─┐
				│ Name │ ID │ StoreID │ Comment │ Scopes │ Status │ Created │ Modified │
				├─┼─┼─┼─┼─┼─┼─┼─┤
				│ DB_KEY │ 36dabbe4d01c49de82847b9a22673cbd │ 850e0805c1084551bb46d150b5dfe414 │ wrangler secret update │ workers │ pending │ [mock-create-date] │ [mock-modified-date] │
				└─┴─┴─┴─┴─┴─┴─┴─┘"
			`);
		});

		it("errors in duplicating a secret when no store-id passed", async ({
			expect,
		}) => {
			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret duplicate " +
						"--secret-id df3f6eb1159a4f10ac5fe836e2b8169c " +
						"--name DUPLICATE_KEY " +
						"--scopes 'workers' " +
						"--comment 'wrangler secret update' " +
						"--remote"
				);
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Not enough non-option arguments: got 0, need at least 1"
			`);
		});

		it("errors in duplicating a secret when no secret-id passed", async ({
			expect,
		}) => {
			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret duplicate " +
						"850e0805c1084551bb46d150b5dfe414 " +
						"--name DUPLICATE_KEY " +
						"--scopes 'workers' " +
						"--comment 'wrangler secret update' " +
						"--remote"
				);
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Missing required argument: secret-id"
			`);
		});

		it("errors in duplicating a secret when no name passed", async ({
			expect,
		}) => {
			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret duplicate " +
						"--secret-id df3f6eb1159a4f10ac5fe836e2b8169c " +
						"850e0805c1084551bb46d150b5dfe414 " +
						"--scopes 'workers' " +
						"--comment 'wrangler secret update' " +
						"--remote"
				);
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Missing required argument: name"
			`);
		});

		it("errors in duplicating a secret when no scopes passed", async ({
			expect,
		}) => {
			let err: undefined | Error;
			try {
				await runWrangler(
					"secrets-store secret duplicate " +
						"--secret-id df3f6eb1159a4f10ac5fe836e2b8169c " +
						"850e0805c1084551bb46d150b5dfe414 " +
						"--name DUPLICATE_KEY " +
						"--comment 'wrangler secret update' " +
						"--remote"
				);
			} catch (e) {
				err = e as Error;
			}
			expect(err?.message).toMatchInlineSnapshot(`
				"Missing required argument: scopes"
			`);
		});
	});
});

/** Create a mock handler for Secrets Store API POST /stores */
function mockStoreCreate(): Promise<CreateStore> {
	return new Promise((resolve) => {
		msw.use(
			http.post(
				"*/accounts/some-account-id/secrets_store/stores",
				async ({ request }) => {
					const reqBody = (await request.json()) as CreateStore;

					resolve(reqBody);

					return HttpResponse.json(
						createFetchResult(
							{
								id: "8b9199cad1954bc39add51c948767679",
								account_id: "1b3ea6aa53af9903d51524c75900323a",
								name: reqBody.name,
								created: mockCreateDate.toString(),
								modified: mockModifiedDate.toString(),
							},
							true
						)
					);
				},
				{ once: true }
			)
		);
	});
}

/** Create a mock handler for Secrets Store API GET /stores */
function mockStoreList() {
	msw.use(
		http.get(
			"*/accounts/some-account-id/secrets_store/stores",
			async () => {
				return HttpResponse.json(
					createFetchResult(
						[
							{
								id: "8686c49f762447988c02fd472f1fa82c",
								account_id: "1b3ea6aa53af9903d51524c75900323a",
								name: "test-store",
								created: mockCreateDate.toISOString(),
								modified: mockModifiedDate.toISOString(),
							},
							{
								id: "8686c49f762447988c02fd472f1fa82d",
								account_id: "1b3ea6aa53af9903d51524c75900323a",
								name: "other-store",
								created: mockCreateDate.toISOString(),
								modified: mockModifiedDate.toISOString(),
							},
						],
						true
					)
				);
			},
			{ once: true }
		)
	);
}

/** Create a mock handler for Secrets Store API GET /stores (response empty) */
function mockStoreListEmpty() {
	msw.use(
		http.get(
			"*/accounts/some-account-id/secrets_store/stores",
			async () => {
				return HttpResponse.json(createFetchResult([], true));
			},
			{ once: true }
		)
	);
}

/** Create a mock handler for Secrets Store API POST /secrets */
function mockSecretCreate(): Promise<CreateSecret[]> {
	return new Promise((resolve) => {
		msw.use(
			http.post(
				"*/accounts/some-account-id/secrets_store/stores/850e0805c1084551bb46d150b5dfe414/secrets",
				async ({ request }) => {
					const reqBody = (await request.json()) as CreateSecret[];
					resolve(reqBody);

					return HttpResponse.json(
						createFetchResult(
							[
								{
									id: "36dabbe4d01c49de82847b9a22673cbd",
									store_id: "850e0805c1084551bb46d150b5dfe414",
									name: reqBody[0].name,
									comment: reqBody[0].comment,
									scopes: reqBody[0].scopes,
									created: mockCreateDate.toISOString(),
									modified: mockModifiedDate.toISOString(),
									status: "pending",
								},
							],
							true
						)
					);
				},
				{ once: true }
			)
		);
	});
}

/** Create a mock handler for Secrets Store API GET /secrets */
function mockSecretList() {
	msw.use(
		http.get(
			"*/accounts/some-account-id/secrets_store/stores/850e0805c1084551bb46d150b5dfe414/secrets?per_page=10&page1",
			async () => {
				return HttpResponse.json(
					createFetchResult(
						[
							{
								id: "8b108ac1cf244f91a17964f585ffa707",
								store_id: "850e0805c1084551bb46d150b5dfe414",
								name: "SECRET_KEY",
								comment: "Key for Algolia search indexing",
								scopes: ["workers"],
								created: mockCreateDate.toISOString(),
								modified: mockModifiedDate.toISOString(),
								status: "active",
							},
							{
								id: "2821af4e600a446f87af4e9944b693c3",
								store_id: "850e0805c1084551bb46d150b5dfe414",
								name: "API_KEY",
								comment: "Key for DigitalOcean droplets",
								scopes: ["workers"],
								created: mockCreateDate.toISOString(),
								modified: mockModifiedDate.toISOString(),
								status: "active",
							},
							{
								id: "df3f6eb1159a4f10ac5fe836e2b8169c",
								store_id: "850e0805c1084551bb46d150b5dfe414",
								name: "DB_KEY",
								comment: "Key for PostgreSQL database",
								scopes: ["workers"],
								created: mockCreateDate.toISOString(),
								modified: mockModifiedDate.toISOString(),
								status: "active",
							},
						],
						true
					)
				);
			},
			{ once: true }
		)
	);
}

/** Create a mock handler for Secrets Store API GET /secrets (response is empty) */
function mockSecretListEmpty() {
	msw.use(
		http.get(
			"*/accounts/some-account-id/secrets_store/stores/850e0805c1084551bb46d150b5dfe414/secrets?per_page=10&page1",
			async () => {
				return HttpResponse.json(createFetchResult([], true));
			},
			{ once: true }
		)
	);
}

/** Create a mock handler for Secrets Store API GET /secrets/:id */
function mockSecretGet() {
	msw.use(
		http.get(
			"*/accounts/some-account-id/secrets_store/stores/850e0805c1084551bb46d150b5dfe414/secrets/df3f6eb1159a4f10ac5fe836e2b8169c",
			async () => {
				return HttpResponse.json(
					createFetchResult(
						{
							id: "df3f6eb1159a4f10ac5fe836e2b8169c",
							store_id: "850e0805c1084551bb46d150b5dfe414",
							name: "DB_KEY",
							comment: "Key for PostgreSQL database",
							scopes: ["workers"],
							created: mockCreateDate.toISOString(),
							modified: mockModifiedDate.toISOString(),
							status: "active",
						},
						true
					)
				);
			},
			{ once: true }
		)
	);
}

/** Create a mock handler for Secrets Store API DELETE /secrets/:id */
function mockSecretDelete() {
	msw.use(
		http.delete(
			"*/accounts/some-account-id/secrets_store/stores/850e0805c1084551bb46d150b5dfe414/secrets/df3f6eb1159a4f10ac5fe836e2b8169c",
			async () => {
				return HttpResponse.json(createFetchResult({}, true));
			},
			{ once: true }
		)
	);
}

/** Create a mock handler for Secrets Store API PATCH /secrets/:id */
function mockSecretUpdate(): Promise<UpdateSecret> {
	return new Promise((resolve) => {
		msw.use(
			http.patch(
				"*/accounts/some-account-id/secrets_store/stores/850e0805c1084551bb46d150b5dfe414/secrets/df3f6eb1159a4f10ac5fe836e2b8169c",
				async ({ request }) => {
					const reqBody = (await request.json()) as UpdateSecret;
					resolve(reqBody);

					return HttpResponse.json(
						createFetchResult(
							{
								id: "36dabbe4d01c49de82847b9a22673cbd",
								store_id: "850e0805c1084551bb46d150b5dfe414",
								name: "DB_KEY",
								comment: reqBody.comment,
								scopes: reqBody.scopes,
								created: mockCreateDate.toISOString(),
								modified: mockModifiedDate.toISOString(),
								status: "pending",
							},
							true
						)
					);
				},
				{ once: true }
			)
		);
	});
}

/** Create a mock handler for Secrets Store API POST /secrets/:id/duplicate */
function mockSecretDuplicate(): Promise<UpdateSecret> {
	return new Promise((resolve) => {
		msw.use(
			http.post(
				"*/accounts/some-account-id/secrets_store/stores/850e0805c1084551bb46d150b5dfe414/secrets/df3f6eb1159a4f10ac5fe836e2b8169c/duplicate",
				async ({ request }) => {
					const reqBody = (await request.json()) as UpdateSecret;
					resolve(reqBody);

					return HttpResponse.json(
						createFetchResult(
							{
								id: "36dabbe4d01c49de82847b9a22673cbd",
								store_id: "850e0805c1084551bb46d150b5dfe414",
								name: "DB_KEY",
								comment: reqBody.comment,
								scopes: reqBody.scopes,
								created: mockCreateDate.toISOString(),
								modified: mockModifiedDate.toISOString(),
								status: "pending",
							},
							true
						)
					);
				},
				{ once: true }
			)
		);
	});
}
