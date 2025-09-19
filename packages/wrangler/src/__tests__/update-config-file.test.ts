import { readFile } from "node:fs/promises";
import { updateConfigFile } from "../config";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockPrompt, mockSelect } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runInTempDir } from "./helpers/run-in-tmp";
import { writeWranglerConfig } from "./helpers/write-wrangler-config";

describe("updateConfigFile()", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();

	const std = mockConsoleMethods();

	const { setIsTTY } = useMockIsTTY();
	beforeEach(() => {
		setIsTTY(false);
	});
	afterEach(() => {
		clearDialogs();
	});

	it("non interactive: no prompts and no file update", async () => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

		await updateConfigFile(
			"kv_namespaces",
			(name) => ({ binding: name ?? "KV", id: "random-id" }),
			"wrangler.json",
			undefined,
			true
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
			{
			  \\"kv_namespaces\\": [
			    {
			      \\"binding\\": \\"KV\\",
			      \\"id\\": \\"random-id\\"
			    }
			  ]
			}
			? Would you like Wrangler to add it on your behalf?
			🤖 Using fallback value in non-interactive context: No"
		`);
		expect(await readFile("wrangler.json", "utf8")).toMatchInlineSnapshot(
			`
			"{
			  \\"compatibility_date\\": \\"2022-01-12\\",
			  \\"name\\": \\"worker\\"
			}"
		`
		);
	});

	it("interactive: no file update after answering no", async () => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

		setIsTTY(true);
		mockSelect({
			text: "Would you like Wrangler to add it on your behalf?",
			result: "no",
		});

		await updateConfigFile(
			"kv_namespaces",
			(name) => ({ binding: name ?? "KV", id: "random-id" }),
			"wrangler.json",
			undefined,
			true
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
			{
			  \\"kv_namespaces\\": [
			    {
			      \\"binding\\": \\"KV\\",
			      \\"id\\": \\"random-id\\"
			    }
			  ]
			}"
		`);
		expect(await readFile("wrangler.json", "utf8")).toMatchInlineSnapshot(
			`
			"{
			  \\"compatibility_date\\": \\"2022-01-12\\",
			  \\"name\\": \\"worker\\"
			}"
		`
		);
	});

	it("interactive: file update after answering yes", async () => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

		setIsTTY(true);
		mockSelect({
			text: "Would you like Wrangler to add it on your behalf?",
			result: "yes",
		});

		await updateConfigFile(
			"kv_namespaces",
			(name) => ({ binding: name ?? "KV", id: "random-id" }),
			"wrangler.json",
			undefined,
			true
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
			{
			  \\"kv_namespaces\\": [
			    {
			      \\"binding\\": \\"KV\\",
			      \\"id\\": \\"random-id\\"
			    }
			  ]
			}"
		`);
		expect(await readFile("wrangler.json", "utf8")).toMatchInlineSnapshot(
			`
			"{
				\\"compatibility_date\\": \\"2022-01-12\\",
				\\"name\\": \\"worker\\",
				\\"kv_namespaces\\": [
					{
						\\"binding\\": \\"KV\\",
						\\"id\\": \\"random-id\\",
						// \\"remote\\" : true // proxy requests to remote resource during local dev, defaults to \`false\`
					}
				]
			}"
		`
		);
	});

	it("interactive: file update in env after answering yes", async () => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

		setIsTTY(true);
		mockSelect({
			text: "Would you like Wrangler to add it on your behalf?",
			result: "yes",
		});

		await updateConfigFile(
			"kv_namespaces",
			(name) => ({ binding: name ?? "KV", id: "random-id" }),
			"wrangler.json",
			"testEnv",
			true
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new KV Namespace in your Worker, add the following snippet to your configuration file in the \\"testEnv\\" environment:
			{
			  \\"kv_namespaces\\": [
			    {
			      \\"binding\\": \\"KV\\",
			      \\"id\\": \\"random-id\\"
			    }
			  ]
			}"
		`);
		expect(await readFile("wrangler.json", "utf8")).toMatchInlineSnapshot(
			`
			"{
				\\"compatibility_date\\": \\"2022-01-12\\",
				\\"name\\": \\"worker\\",
				\\"env\\": {
					\\"testEnv\\": {
						\\"kv_namespaces\\": [
							{
								\\"binding\\": \\"KV\\",
								\\"id\\": \\"random-id\\",
								// \\"remote\\" : true // proxy requests to remote resource during local dev, defaults to \`false\`
							}
						]
					}
				}
			}"
		`
		);
	});

	it("interactive: file update after answering yes-but", async () => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

		setIsTTY(true);
		mockSelect({
			text: "Would you like Wrangler to add it on your behalf?",
			result: "yes-but",
		});

		mockPrompt({
			text: "What binding name would you like to use?",
			result: "HELLO",
		});

		await updateConfigFile(
			"kv_namespaces",
			(name) => ({ binding: name ?? "KV", id: "random-id" }),
			"wrangler.json",
			undefined,
			true
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
			{
			  \\"kv_namespaces\\": [
			    {
			      \\"binding\\": \\"KV\\",
			      \\"id\\": \\"random-id\\"
			    }
			  ]
			}"
		`);
		expect(await readFile("wrangler.json", "utf8")).toMatchInlineSnapshot(
			`
			"{
				\\"compatibility_date\\": \\"2022-01-12\\",
				\\"name\\": \\"worker\\",
				\\"kv_namespaces\\": [
					{
						\\"binding\\": \\"KV\\",
						\\"id\\": \\"random-id\\",
						// \\"remote\\" : true // proxy requests to remote resource during local dev, defaults to \`false\`
					}
				]
			}"
		`
		);
	});

	it("interactive: no prompts & no file update for toml", async () => {
		writeWranglerConfig({ name: "worker" }, "wrangler.toml");

		setIsTTY(true);

		await updateConfigFile(
			"kv_namespaces",
			(name) => ({ binding: name ?? "KV", id: "random-id" }),
			"wrangler.toml",
			undefined,
			true
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
			[[kv_namespaces]]
			binding = \\"KV\\"
			id = \\"random-id\\"
			"
		`);
		expect(await readFile("wrangler.toml", "utf8")).toMatchInlineSnapshot(
			`
			"compatibility_date = \\"2022-01-12\\"
			name = \\"worker\\"
			"
		`
		);
	});

	it("interactive: no prompts & no file update for no config file", async () => {
		setIsTTY(true);

		await updateConfigFile(
			"kv_namespaces",
			(name) => ({ binding: name ?? "KV", id: "random-id" }),
			undefined,
			undefined,
			true
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
			{
			  \\"kv_namespaces\\": [
			    {
			      \\"binding\\": \\"KV\\",
			      \\"id\\": \\"random-id\\"
			    }
			  ]
			}"
		`);
		await expect(readFile("wrangler.json", "utf8")).rejects.toThrowError(
			"ENOENT"
		);
	});

	it("logs correct binding type", async () => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

		await updateConfigFile(
			"d1_databases",
			() => ({
				binding: "D1",
				database_id: "database_id",
			}),
			"wrangler.json",
			undefined,
			true
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new D1 Database in your Worker, add the following snippet to your configuration file:
			{
			  \\"d1_databases\\": [
			    {
			      \\"binding\\": \\"D1\\",
			      \\"database_id\\": \\"database_id\\"
			    }
			  ]
			}
			? Would you like Wrangler to add it on your behalf?
			🤖 Using fallback value in non-interactive context: No"
		`);
	});
});
