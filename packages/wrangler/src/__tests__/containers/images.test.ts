import { getCloudflareContainerRegistry } from "@cloudflare/containers-shared";
import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockAccount, setWranglerConfig } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

// Helper to wrap responses in v4 API schema format for containers endpoint
function wrapV4Response<T>(result: T) {
	return { success: true, result };
}

describe("containers images list", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	const REGISTRY = getCloudflareContainerRegistry();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);
	runInTempDir();
	afterEach(() => {
		patchConsole(() => {});
		msw.resetHandlers();
	});

	it("should help", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		await runWrangler("containers images list --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers images list

			List images in the Cloudflare managed registry [open beta]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

			OPTIONS
			      --filter  Regex to filter results  [string]
			      --json    Format output as JSON  [boolean] [default: false]"
		`);
	});

	it("should list images", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		const tags = {
			one: ["hundred", "ten", "sha256:239a0dfhasdfui235"],
			two: ["thousand", "twenty", "sha256:badfga4mag0vhjakf"],
			three: ["million", "thirty", "sha256:23f0adfgbja0f0jf0"],
		};

		msw.use(
			http.post("*/registries/:domain/credentials", async ({ params }) => {
				expect(params.domain).toEqual(REGISTRY);
				return HttpResponse.json(
					wrapV4Response({
						account_id: "1234",
						registry_host: REGISTRY,
						username: "foo",
						password: "bar",
					})
				);
			}),
			http.get("*/v2/_catalog?tags=true", async () => {
				return HttpResponse.json({ repositories: tags });
			})
		);

		await runWrangler("containers images list");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"REPOSITORY  TAG
			one         hundred
			one         ten
			two         thousand
			two         twenty
			three       million
			three       thirty"
		`);
	});

	it("should list images with a filter", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		const tags = {
			one: ["hundred", "ten", "sha256:239a0dfhasdfui235"],
			two: ["thousand", "twenty", "sha256:badfga4mag0vhjakf"],
			three: ["million", "thirty", "sha256:23f0adfgbja0f0jf0"],
		};

		msw.use(
			http.post("*/registries/:domain/credentials", async ({ params }) => {
				expect(params.domain).toEqual(REGISTRY);
				return HttpResponse.json(
					wrapV4Response({
						account_id: "1234",
						registry_host: REGISTRY,
						username: "foo",
						password: "bar",
					})
				);
			}),
			http.get("*/v2/_catalog?tags=true", async () => {
				return HttpResponse.json({ repositories: tags });
			})
		);
		await runWrangler("containers images list --filter '^two$'");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"REPOSITORY  TAG
			two         thousand
			two         twenty"
		`);
	});

	it("should list repos with json flag set", async () => {
		setWranglerConfig({});
		const tags = {
			one: ["hundred", "ten", "sha256:239a0dfhasdfui235"],
			two: ["thousand", "twenty", "sha256:badfga4mag0vhjakf"],
			three: ["million", "thirty", "sha256:23f0adfgbja0f0jf0"],
		};

		msw.use(
			http.post("*/registries/:domain/credentials", async ({ params }) => {
				expect(params.domain).toEqual(REGISTRY);
				return HttpResponse.json(
					wrapV4Response({
						account_id: "1234",
						registry_host: REGISTRY,
						username: "foo",
						password: "bar",
					})
				);
			}),
			http.get("*/v2/_catalog?tags=true", async () => {
				return HttpResponse.json({ repositories: tags });
			})
		);
		await runWrangler("containers images list --json");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"[
			  {
			    \\"name\\": \\"one\\",
			    \\"tags\\": [
			      \\"hundred\\",
			      \\"ten\\"
			    ]
			  },
			  {
			    \\"name\\": \\"two\\",
			    \\"tags\\": [
			      \\"thousand\\",
			      \\"twenty\\"
			    ]
			  },
			  {
			    \\"name\\": \\"three\\",
			    \\"tags\\": [
			      \\"million\\",
			      \\"thirty\\"
			    ]
			  }
			]"
		`);
	});
});

describe("containers images delete", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	const REGISTRY = getCloudflareContainerRegistry();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);
	runInTempDir();
	afterEach(() => {
		patchConsole(() => {});
		msw.resetHandlers();
	});

	it("should help", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		await runWrangler("containers images delete --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler containers images delete <image>

			Remove an image from the Cloudflare managed registry [open beta]

			POSITIONALS
			  image  Image and tag to delete, of the form IMAGE:TAG  [string] [required]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	it("should delete images", async () => {
		setIsTTY(false);
		setWranglerConfig({});

		msw.use(
			http.post("*/registries/:domain/credentials", async ({ params }) => {
				expect(params.domain).toEqual(REGISTRY);
				return HttpResponse.json(
					wrapV4Response({
						account_id: "1234",
						registry_host: REGISTRY,
						username: "foo",
						password: "bar",
					})
				);
			}),
			http.head("*/v2/:accountId/:image/manifests/:tag", async ({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.image).toEqual("one");
				expect(params.tag).toEqual("hundred");
				return new HttpResponse("", {
					status: 200,
					headers: { "Docker-Content-Digest": "some-digest" },
				});
			}),
			http.delete(
				"*/v2/:accountId/:image/manifests/:tag",
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.image).toEqual("one");
					expect(params.tag).toEqual("hundred");
					return new HttpResponse("", { status: 200 });
				}
			),
			http.put("*/v2/gc/layers", async () => {
				return new HttpResponse("", { status: 200 });
			})
		);
		await runWrangler("containers images delete one:hundred");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(
			`"Deleted one:hundred (some-digest)"`
		);
	});

	it("should error when provided a repo without a tag", async () => {
		setIsTTY(false);
		setWranglerConfig({});

		msw.use(
			http.post("*/registries/:domain/credentials", async ({ params }) => {
				expect(params.domain).toEqual(REGISTRY);
				return HttpResponse.json(
					wrapV4Response({
						account_id: "1234",
						registry_host: REGISTRY,
						username: "foo",
						password: "bar",
					})
				);
			})
		);
		await expect(runWrangler("containers images delete one")).rejects
			.toThrowErrorMatchingInlineSnapshot(`
				[Error: Invalid image format. Expected IMAGE:TAG]
			`);
	});
});
