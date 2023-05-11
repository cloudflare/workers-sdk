import * as fs from "node:fs";
import { rest } from "msw";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("constellation help", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should show help when no argument is passed", async () => {
		await runWrangler("constellation");
		await endEventLoop();

		expect(std.out).toMatchInlineSnapshot(`
		"wrangler constellation

		🤖 Interact with Constellation AI models

		Commands:
		  wrangler constellation project  Manage your projects
		  wrangler constellation model    Manage your models
		  wrangler constellation catalog  Check the curated model catalog
		  wrangler constellation runtime  Check the suported runtimes

		Flags:
		  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
		  -c, --config                    Path to .toml configuration file  [string]
		  -e, --env                       Environment to use for operations and .env files  [string]
		  -h, --help                      Show help  [boolean]
		  -v, --version                   Show version number  [boolean]"
	`);
	});

	it("should show help when an invalid argument is passed", async () => {
		await expect(() => runWrangler("constellation asdf")).rejects.toThrow(
			"Unknown argument: asdf"
		);

		expect(std.err).toMatchInlineSnapshot(`
		"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: asdf[0m

		"
	`);
		expect(std.out).toMatchInlineSnapshot(`
		"
		wrangler constellation

		🤖 Interact with Constellation AI models

		Commands:
		  wrangler constellation project  Manage your projects
		  wrangler constellation model    Manage your models
		  wrangler constellation catalog  Check the curated model catalog
		  wrangler constellation runtime  Check the suported runtimes

		Flags:
		  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
		  -c, --config                    Path to .toml configuration file  [string]
		  -e, --env                       Environment to use for operations and .env files  [string]
		  -h, --help                      Show help  [boolean]
		  -v, --version                   Show version number  [boolean]"
	`);
	});
});

describe("constellation commands", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();

	const std = mockConsoleMethods();

	beforeEach(() => {
		// @ts-expect-error we're using a very simple setTimeout mock here
		jest.spyOn(global, "setTimeout").mockImplementation((fn, _period) => {
			setImmediate(fn);
		});
		setIsTTY(true);
	});

	afterEach(() => {
		clearDialogs();
	});

	it("should handle project creation", async () => {
		mockConstellationRequest();
		await runWrangler("constellation project create new_project ONNX");
		expect(std.out).toMatchInlineSnapshot(`
		"--------------------
		🚧 Constellation AI is currently in open alpha and is not recommended for production data and traffic
		🚧 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		🚧 To give feedback, visit https://discord.gg/cloudflaredev
		--------------------

		✅ Successfully created Project \\"new_project3\\"!"
	`);
	});

	it("should handle project listing", async () => {
		mockConstellationRequest();
		await runWrangler("constellation project list");
		expect(std.out).toMatchInlineSnapshot(`
		"--------------------
		🚧 Constellation AI is currently in open alpha and is not recommended for production data and traffic
		🚧 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		🚧 To give feedback, visit https://discord.gg/cloudflaredev
		--------------------

		┌──────────────────────────────────────┬──────────────┬─────────┬─────────────────────────────┐
		│ id                                   │ name         │ runtime │ created_at                  │
		├──────────────────────────────────────┼──────────────┼─────────┼─────────────────────────────┤
		│ 4806cdcf-9aa7-4fa2-b6a1-77fe9e196680 │ new_project3 │ ONNX    │ 2023-04-28T13:25:58.513105Z │
		└──────────────────────────────────────┴──────────────┴─────────┴─────────────────────────────┘"
	`);
	});

	it("should handle project deletion", async () => {
		mockConstellationRequest();
		mockConfirm({
			text: "Ok to proceed?",
			result: true,
		});

		await runWrangler("constellation project delete new_project3");
		expect(std.out).toMatchInlineSnapshot(`
		"--------------------
		🚧 Constellation AI is currently in open alpha and is not recommended for production data and traffic
		🚧 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		🚧 To give feedback, visit https://discord.gg/cloudflaredev
		--------------------

		About to delete Project 'new_project3' (4806cdcf-9aa7-4fa2-b6a1-77fe9e196680).
		Deleting...
		Deleted 'new_project3' successfully."
	`);
	});

	it("should handle catalog list", async () => {
		mockConstellationRequest();
		await runWrangler("constellation catalog list");
		expect(std.out).toMatchInlineSnapshot(`
		"--------------------
		🚧 Constellation AI is currently in open alpha and is not recommended for production data and traffic
		🚧 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		🚧 To give feedback, visit https://discord.gg/cloudflaredev
		--------------------

		┌──────────────────────────────────────┬──────────────────────┬─────────────────┬───────────────┐
		│ project_id                           │ project_name         │ project_runtime │ models        │
		├──────────────────────────────────────┼──────────────────────┼─────────────────┼───────────────┤
		│ b162a29d-0a6d-4155-bedf-54a01fc8d0ef │ image-classification │ ONNX            │ squeezenet1_1 │
		└──────────────────────────────────────┴──────────────────────┴─────────────────┴───────────────┘"
	`);
	});

	it("should handle runtime list", async () => {
		mockConstellationRequest();
		await runWrangler("constellation runtime list");
		expect(std.out).toMatchInlineSnapshot(`
		"--------------------
		🚧 Constellation AI is currently in open alpha and is not recommended for production data and traffic
		🚧 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		🚧 To give feedback, visit https://discord.gg/cloudflaredev
		--------------------

		┌─────────┐
		│ name    │
		├─────────┤
		│ ONNX    │
		├─────────┤
		│ XGBoost │
		└─────────┘"
	`);
	});

	it("should handle model upload", async () => {
		mockConstellationRequest();
		await fs.promises.writeFile("model.onnx", `model`);
		await runWrangler(
			"constellation model upload new_project3 model2 model.onnx"
		);
		expect(std.out).toMatchInlineSnapshot(`
		"--------------------
		🚧 Constellation AI is currently in open alpha and is not recommended for production data and traffic
		🚧 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		🚧 To give feedback, visit https://discord.gg/cloudflaredev
		--------------------

		✅ Successfully uploaded Model \\"model2\\"!"
	`);
	});

	it("should handle model list", async () => {
		mockConstellationRequest();
		await runWrangler("constellation model list new_project3");
		expect(std.out).toMatchInlineSnapshot(`
		"--------------------
		🚧 Constellation AI is currently in open alpha and is not recommended for production data and traffic
		🚧 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		🚧 To give feedback, visit https://discord.gg/cloudflaredev
		--------------------

		┌──────────────────────────────────────┬──────────────────────────────────────┬────────┬─────────────┬─────────────────────────────┐
		│ id                                   │ project_id                           │ name   │ description │ created_at                  │
		├──────────────────────────────────────┼──────────────────────────────────────┼────────┼─────────────┼─────────────────────────────┤
		│ 450bb086-3c09-4991-a0cc-eed48c504ae0 │ 9d478427-dea6-4988-9b16-f6f8888d974c │ model1 │             │ 2023-04-28T11:15:14.806217Z │
		├──────────────────────────────────────┼──────────────────────────────────────┼────────┼─────────────┼─────────────────────────────┤
		│ 2dd35b4e-0c7a-4c7a-a9e2-e33c0e17bc02 │ 9d478427-dea6-4988-9b16-f6f8888d974c │ model2 │             │ 2023-04-28T13:50:37.494090Z │
		└──────────────────────────────────────┴──────────────────────────────────────┴────────┴─────────────┴─────────────────────────────┘"
	`);
	});

	it("should handle model deletion", async () => {
		mockConstellationRequest();
		mockConfirm({
			text: "Ok to proceed?",
			result: true,
		});

		await runWrangler("constellation model delete new_project3 model2");
		expect(std.out).toMatchInlineSnapshot(`
		"--------------------
		🚧 Constellation AI is currently in open alpha and is not recommended for production data and traffic
		🚧 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
		🚧 To give feedback, visit https://discord.gg/cloudflaredev
		--------------------

		About to delete Model 'model2' (2dd35b4e-0c7a-4c7a-a9e2-e33c0e17bc02).
		Deleting...
		Deleted 'model2' successfully."
	`);
	});
});

/** Create a mock handler for Constellation API */
function mockConstellationRequest() {
	msw.use(
		rest.get("*/accounts/:accountId/constellation/project", (req, res, ctx) => {
			return res.once(
				ctx.json(
					createFetchResult(
						[
							{
								id: "4806cdcf-9aa7-4fa2-b6a1-77fe9e196680",
								name: "new_project3",
								runtime: "ONNX",
								created_at: "2023-04-28T13:25:58.513105Z",
							},
						],
						true
					)
				)
			);
		}),
		rest.post(
			"*/accounts/:accountId/constellation/project",
			(req, res, ctx) => {
				return res.once(
					ctx.json(
						createFetchResult(
							{
								id: "4806cdcf-9aa7-4fa2-b6a1-77fe9e196680",
								name: "new_project3",
								runtime: "ONNX",
								created_at: "2023-04-28T13:25:58.513105Z",
							},
							true
						)
					)
				);
			}
		),
		rest.delete(
			"*/accounts/:accountId/constellation/project/4806cdcf-9aa7-4fa2-b6a1-77fe9e196680",
			(req, res, ctx) => {
				return res.once(ctx.json(createFetchResult(null, true)));
			}
		),
		rest.get("*/accounts/:accountId/constellation/catalog", (req, res, ctx) => {
			return res.once(
				ctx.json(
					createFetchResult(
						[
							{
								project: {
									id: "b162a29d-0a6d-4155-bedf-54a01fc8d0ef",
									name: "image-classification",
									runtime: "ONNX",
									created_at: "2023-04-27T18:55:38.417187Z",
								},
								models: [
									{
										id: "edb202d3-f4ac-43ab-8762-3ae6b43c4c57",
										project_id: "b162a29d-0a6d-4155-bedf-54a01fc8d0ef",
										name: "squeezenet1_1",
										description: null,
										created_at: "2023-04-27T18:56:15.305087Z",
									},
								],
							},
						],
						true
					)
				)
			);
		}),
		rest.get("*/accounts/:accountId/constellation/runtime", (req, res, ctx) => {
			return res.once(ctx.json(createFetchResult(["ONNX", "XGBoost"], true)));
		}),
		rest.post(
			"*/accounts/:accountId/constellation/project/4806cdcf-9aa7-4fa2-b6a1-77fe9e196680/model",
			(req, res, ctx) => {
				return res.once(
					ctx.json(
						createFetchResult(
							{
								id: "2dd35b4e-0c7a-4c7a-a9e2-e33c0e17bc02",
								project_id: "4806cdcf-9aa7-4fa2-b6a1-77fe9e196680",
								name: "model2",
								description: null,
								created_at: "2023-04-28T13:50:37.494090Z",
							},
							true
						)
					)
				);
			}
		),
		rest.get(
			"*/accounts/:accountId/constellation/project/4806cdcf-9aa7-4fa2-b6a1-77fe9e196680/model",
			(req, res, ctx) => {
				return res.once(
					ctx.json(
						createFetchResult(
							[
								{
									id: "450bb086-3c09-4991-a0cc-eed48c504ae0",
									project_id: "9d478427-dea6-4988-9b16-f6f8888d974c",
									name: "model1",
									description: null,
									created_at: "2023-04-28T11:15:14.806217Z",
								},
								{
									id: "2dd35b4e-0c7a-4c7a-a9e2-e33c0e17bc02",
									project_id: "9d478427-dea6-4988-9b16-f6f8888d974c",
									name: "model2",
									description: null,
									created_at: "2023-04-28T13:50:37.494090Z",
								},
							],
							true
						)
					)
				);
			}
		),
		rest.delete(
			"*/accounts/:accountId/constellation/project/4806cdcf-9aa7-4fa2-b6a1-77fe9e196680/model/2dd35b4e-0c7a-4c7a-a9e2-e33c0e17bc02",
			(req, res, ctx) => {
				return res.once(ctx.json(createFetchResult(null, true)));
			}
		)
	);
}
