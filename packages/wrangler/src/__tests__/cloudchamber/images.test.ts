import { http, HttpResponse } from "msw";
import patchConsole from "patch-console";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { mockAccount, setWranglerConfig } from "./utils";

describe("cloudchamber image", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	mockAccountId();
	mockApiToken();
	beforeEach(mockAccount);
	runInTempDir();
	afterEach(() => {
		patchConsole(() => {});
		msw.resetHandlers();
	});

	it("should help", async () => {
		await runWrangler("cloudchamber registries --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler cloudchamber registries

			Configure registries via Cloudchamber

			COMMANDS
			  wrangler cloudchamber registries configure             Configure Cloudchamber to pull from specific registries
			  wrangler cloudchamber registries credentials [domain]  get a temporary password for a specific domain
			  wrangler cloudchamber registries remove [domain]       removes the registry at the given domain
			  wrangler cloudchamber registries list                  list registries configured for this account

			GLOBAL FLAGS
			  -c, --config   Path to Wrangler configuration file  [string]
			      --cwd      Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]

			OPTIONS
			      --json  Return output as clean JSON  [boolean] [default: false]"
		`);
	});

	it("should create an image registry (no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.post(
				"*/registries",
				async ({ request }) => {
					expect(await request.json()).toEqual({
						domain: "docker.io",
						is_public: false,
					});
					return HttpResponse.json({
						domain: "docker.io",
					});
				},
				{ once: true }
			)
		);

		await runWrangler(
			"cloudchamber registries configure --domain docker.io --public false"
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		// so testing the actual UI will be harder than expected
		// TODO: think better on how to test UI actions
		expect(std.out).toMatchInlineSnapshot(`
		"{
		    \\"domain\\": \\"docker.io\\"
		}"
	`);
	});

	it("should create an image registry (no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.post(
				"*/registries/docker.io/credentials",
				async () => {
					return HttpResponse.json({
						password: "jwt",
					});
				},
				{ once: true }
			)
		);

		await runWrangler(
			"cloudchamber registries credentials docker.io --push --pull"
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
		// so testing the actual UI will be harder than expected
		// TODO: think better on how to test UI actions
		expect(std.out).toMatchInlineSnapshot(`"jwt"`);
	});

	it("should remove an image registry (no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.delete(
				"*/registries/:domain",
				async ({ params }) => {
					const domain = String(params["domain"]);
					expect(domain === "docker.io");
					return HttpResponse.json({});
				},
				{ once: true }
			)
		);
		await runWrangler("cloudchamber registries remove docker.io");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`"{}"`);
	});

	it("should list registries (no interactivity)", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		msw.use(
			http.get(
				"*/registries",
				async () => {
					return HttpResponse.json([
						{
							public_key: "",
							domain: "docker.io",
						},
						{
							public_key: "some_public_key",
							domain: "docker.io2",
						},
					]);
				},
				{ once: true }
			)
		);
		await runWrangler("cloudchamber registries list");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"[
			    {
			        \\"public_key\\": \\"\\",
			        \\"domain\\": \\"docker.io\\"
			    },
			    {
			        \\"public_key\\": \\"some_public_key\\",
			        \\"domain\\": \\"docker.io2\\"
			    }
			]"
		`);
	});
});

describe("cloudchamber image list", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

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
		await runWrangler("cloudchamber images list --help");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler cloudchamber images list

			perform operations on images in your Cloudflare managed registry

			GLOBAL FLAGS
			  -c, --config   Path to Wrangler configuration file  [string]
			      --cwd      Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]

			OPTIONS
			      --json    Return output as clean JSON  [boolean] [default: false]
			      --filter  Regex to filter results  [string]"
		`);
	});
	it("should list images", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		const tags: Map<string, string[]> = new Map([
			["one", ["hundred", "ten", "sha256:239a0dfhasdfui235"]],
			["two", ["thousand", "twenty", "sha256:badfga4mag0vhjakf"]],
			["three", ["million", "thirty", "sha256:23f0adfgbja0f0jf0"]],
		]);

		msw.use(
			http.post("*/registries/:domain/credentials", async ({ params }) => {
				const domain = String(params["domain"]);
				expect(domain === "docker.io");
				return HttpResponse.json({
					account_id: "1234",
					registry_host: "docker.io",
					username: "foo",
					password: "bar",
				});
			}),
			http.get("*/v2/_catalog", async () => {
				return HttpResponse.json({ repositories: ["one", "two", "three"] });
			}),
			http.get("*/v2/:repo/tags/list", async ({ params }) => {
				const repo = String(params["repo"]);
				const t = tags.get(repo);
				return HttpResponse.json({
					name: `${repo}`,
					tags: t,
				});
			})
		);
		await runWrangler("cloudchamber images list");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"┌────────────┬─────────────────┐
			│ REPOSITORY │ TAG             │
			├────────────┼─────────────────┤
			│ one        │ hundred ten     │
			├────────────┼─────────────────┤
			│ two        │ thousand twenty │
			├────────────┼─────────────────┤
			│ three      │ million thirty  │
			└────────────┴─────────────────┘"
		`);
	});
	it("should list images with a filter", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		const tags: Map<string, string[]> = new Map([
			["one", ["hundred", "ten", "sha256:239a0dfhasdfui235"]],
			["two", ["thousand", "twenty", "sha256:badfga4mag0vhjakf"]],
			["three", ["million", "thirty", "sha256:23f0adfgbja0f0jf0"]],
		]);

		msw.use(
			http.post("*/registries/:domain/credentials", async ({ params }) => {
				const domain = String(params["domain"]);
				expect(domain === "docker.io");
				return HttpResponse.json({
					account_id: "1234",
					registry_host: "docker.io",
					username: "foo",
					password: "bar",
				});
			}),
			http.get("*/v2/_catalog", async () => {
				return HttpResponse.json({ repositories: ["one", "two", "three"] });
			}),
			http.get("*/v2/:repo/tags/list", async ({ params }) => {
				const repo = String(params["repo"]);
				const t = tags.get(repo);
				return HttpResponse.json({
					name: `${repo}`,
					tags: t,
				});
			})
		);
		await runWrangler("cloudchamber images list --filter '^two$'");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"┌────────────┬─────────────────┐
			│ REPOSITORY │ TAG             │
			├────────────┼─────────────────┤
			│ two        │ thousand twenty │
			└────────────┴─────────────────┘"
		`);
	});
	it("should filter out repos with no non-sha tags", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		const tags: Map<string, string[]> = new Map([
			["one", ["hundred", "ten", "sha256:239a0dfhasdfui235"]],
			["two", ["thousand", "twenty", "sha256:badfga4mag0vhjakf"]],
			["three", ["million", "thirty", "sha256:23f0adfgbja0f0jf0"]],
			["empty", []],
			["shaonly", ["sha256:23f0adfgbja0f0jf0"]],
		]);

		msw.use(
			http.post("*/registries/:domain/credentials", async ({ params }) => {
				const domain = String(params["domain"]);
				expect(domain === "docker.io");
				return HttpResponse.json({
					account_id: "1234",
					registry_host: "docker.io",
					username: "foo",
					password: "bar",
				});
			}),
			http.get("*/v2/_catalog", async () => {
				return HttpResponse.json({ repositories: ["one", "two", "three"] });
			}),
			http.get("*/v2/:repo/tags/list", async ({ params }) => {
				const repo = String(params["repo"]);
				const t = tags.get(repo);
				return HttpResponse.json({
					name: `${repo}`,
					tags: t,
				});
			})
		);
		await runWrangler("cloudchamber images list");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`
			"┌────────────┬─────────────────┐
			│ REPOSITORY │ TAG             │
			├────────────┼─────────────────┤
			│ one        │ hundred ten     │
			├────────────┼─────────────────┤
			│ two        │ thousand twenty │
			├────────────┼─────────────────┤
			│ three      │ million thirty  │
			└────────────┴─────────────────┘"
		`);
	});
	it("should list repos with json flag set", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		const tags: Map<string, string[]> = new Map([
			["one", ["hundred", "ten", "sha256:239a0dfhasdfui235"]],
			["two", ["thousand", "twenty", "sha256:badfga4mag0vhjakf"]],
			["three", ["million", "thirty", "sha256:23f0adfgbja0f0jf0"]],
		]);

		msw.use(
			http.post("*/registries/:domain/credentials", async ({ params }) => {
				const domain = String(params["domain"]);
				expect(domain === "docker.io");
				return HttpResponse.json({
					account_id: "1234",
					registry_host: "docker.io",
					username: "foo",
					password: "bar",
				});
			}),
			http.get("*/v2/_catalog", async () => {
				return HttpResponse.json({ repositories: ["one", "two", "three"] });
			}),
			http.get("*/v2/:repo/tags/list", async ({ params }) => {
				const repo = String(params["repo"]);
				const t = tags.get(repo);
				return HttpResponse.json({
					name: `${repo}`,
					tags: t,
				});
			})
		);
		await runWrangler("cloudchamber images list --json");
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
	it("should filter out repos with no non-sha tags in json output", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		const tags: Map<string, string[]> = new Map([
			["one", ["hundred", "ten", "sha256:239a0dfhasdfui235"]],
			["two", ["thousand", "twenty", "sha256:badfga4mag0vhjakf"]],
			["three", ["million", "thirty", "sha256:23f0adfgbja0f0jf0"]],
			["empty", []],
			["shaonly", ["sha256:23f0adfgbja0f0jf0"]],
		]);

		msw.use(
			http.post("*/registries/:domain/credentials", async ({ params }) => {
				const domain = String(params["domain"]);
				expect(domain === "docker.io");
				return HttpResponse.json({
					account_id: "1234",
					registry_host: "docker.io",
					username: "foo",
					password: "bar",
				});
			}),
			http.get("*/v2/_catalog", async () => {
				return HttpResponse.json({ repositories: ["one", "two", "three"] });
			}),
			http.get("*/v2/:repo/tags/list", async ({ params }) => {
				const repo = String(params["repo"]);
				const t = tags.get(repo);
				return HttpResponse.json({
					name: `${repo}`,
					tags: t,
				});
			})
		);
		await runWrangler("cloudchamber images list --json");
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
	it("should delete images", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		const tags: Map<string, string[]> = new Map([
			["one", ["hundred", "ten", "sha256:239a0dfhasdfui235"]],
			["two", ["thousand", "twenty", "sha256:badfga4mag0vhjakf"]],
			["three", ["million", "thirty", "sha256:23f0adfgbja0f0jf0"]],
		]);

		msw.use(
			http.post("*/registries/:domain/credentials", async ({ params }) => {
				const domain = String(params["domain"]);
				expect(domain === "docker.io");
				return HttpResponse.json({
					account_id: "1234",
					registry_host: "docker.io",
					username: "foo",
					password: "bar",
				});
			}),
			http.get("*/v2/_catalog", async () => {
				return HttpResponse.json({ repositories: ["one", "two", "three"] });
			}),
			http.get("*/v2/:repo/tags/list", async ({ params }) => {
				const repo = String(params["repo"]);
				const t = tags.get(repo);
				return HttpResponse.json({
					name: `${repo}`,
					tags: t,
				});
			}),
			http.head("*/v2/:image/manifests/:tag", async ({ params }) => {
				const image = String(params["image"]);
				expect(image === "one");
				const tag = String(params["tag"]);
				expect(tag === "hundred");
				return new HttpResponse("", {
					status: 200,
					headers: { "Docker-Content-Digest": "some-digest" },
				});
			}),
			http.delete("*/v2/:image/manifests/:tag", async ({ params }) => {
				const image = String(params["image"]);
				expect(image === "one");
				const tag = String(params["tag"]);
				expect(tag === "hundred");
				return new HttpResponse("", { status: 200 });
			}),
			http.put("*/v2/gc/layers", async () => {
				return new HttpResponse("", { status: 200 });
			})
		);
		await runWrangler("cloudchamber images delete one:hundred");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(`"Deleted tag: one:hundred"`);
	});
	it("should error when provided a repo without a tag", async () => {
		setIsTTY(false);
		setWranglerConfig({});
		const tags: Map<string, string[]> = new Map([
			["one", ["hundred", "ten", "sha256:239a0dfhasdfui235"]],
			["two", ["thousand", "twenty", "sha256:badfga4mag0vhjakf"]],
			["three", ["million", "thirty", "sha256:23f0adfgbja0f0jf0"]],
		]);

		msw.use(
			http.post("*/registries/:domain/credentials", async ({ params }) => {
				const domain = String(params["domain"]);
				expect(domain === "docker.io");
				return HttpResponse.json({
					account_id: "1234",
					registry_host: "docker.io",
					username: "foo",
					password: "bar",
				});
			}),
			http.get("*/v2/_catalog", async () => {
				return HttpResponse.json({ repositories: ["one", "two", "three"] });
			}),
			http.get("*/v2/:repo/tags/list", async ({ params }) => {
				const repo = String(params["repo"]);
				const t = tags.get(repo);
				return HttpResponse.json({
					name: `${repo}`,
					tags: t,
				});
			})
		);
		await runWrangler("cloudchamber images delete one");
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.out).toMatchInlineSnapshot(
			`"Error when removing image: Error: Must provide a tag to delete"`
		);
	});
});
