import { readFile } from "node:fs/promises";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it } from "vitest";
import { createdResourceConfig } from "../utils/add-created-resource-config";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm, mockPrompt } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("createdResourceConfig()", () => {
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

	it("non interactive: no prompts and no file update", async ({ expect }) => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

		await createdResourceConfig(
			"kv_namespaces",
			(name) => ({ binding: name ?? "KV", id: "random-id" }),
			"wrangler.json",
			undefined
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
			{
			  "kv_namespaces": [
			    {
			      "binding": "KV",
			      "id": "random-id"
			    }
			  ]
			}
			? Would you like Wrangler to add it on your behalf?
			🤖 Using fallback value in non-interactive context: no"
		`);
		expect(await readFile("wrangler.json", "utf8")).toMatchInlineSnapshot(
			`
			"{
			  "compatibility_date": "2022-01-12",
			  "name": "worker"
			}"
		`
		);
	});

	it("interactive: no file update after answering no", async ({ expect }) => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

		setIsTTY(true);
		mockConfirm({
			text: "Would you like Wrangler to add it on your behalf?",
			result: false,
		});

		await createdResourceConfig(
			"kv_namespaces",
			(name) => ({ binding: name ?? "KV", id: "random-id" }),
			"wrangler.json",
			undefined
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
			{
			  "kv_namespaces": [
			    {
			      "binding": "KV",
			      "id": "random-id"
			    }
			  ]
			}"
		`);
		expect(await readFile("wrangler.json", "utf8")).toMatchInlineSnapshot(
			`
			"{
			  "compatibility_date": "2022-01-12",
			  "name": "worker"
			}"
		`
		);
	});

	it("interactive: file update after answering yes", async ({ expect }) => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

		setIsTTY(true);
		mockConfirm({
			text: "Would you like Wrangler to add it on your behalf?",
			result: true,
		});
		mockPrompt({
			text: "What binding name would you like to use?",
			result: "KV",
		});
		mockConfirm({
			text: "For local dev, do you want to connect to the remote resource instead of a local resource?",
			result: false,
		});

		await createdResourceConfig(
			"kv_namespaces",
			(name) => ({ binding: name ?? "KV", id: "random-id" }),
			"wrangler.json",
			undefined
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
			{
			  "kv_namespaces": [
			    {
			      "binding": "KV",
			      "id": "random-id"
			    }
			  ]
			}"
		`);
		expect(await readFile("wrangler.json", "utf8")).toMatchInlineSnapshot(
			`
			"{
				"compatibility_date": "2022-01-12",
				"name": "worker",
				"kv_namespaces": [
					{
						"binding": "KV",
						"id": "random-id"
					}
				]
			}"
		`
		);
	});

	it("interactive: file update in env after answering yes", async ({
		expect,
	}) => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

		setIsTTY(true);
		mockConfirm({
			text: "Would you like Wrangler to add it on your behalf?",
			result: true,
		});
		mockPrompt({
			text: "What binding name would you like to use?",
			result: "KV",
		});
		mockConfirm({
			text: "For local dev, do you want to connect to the remote resource instead of a local resource?",
			result: true,
		});

		await createdResourceConfig(
			"kv_namespaces",
			(name) => ({ binding: name ?? "KV", id: "random-id" }),
			"wrangler.json",
			"testEnv"
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new KV Namespace in your Worker, add the following snippet to your configuration file in the "testEnv" environment:
			{
			  "kv_namespaces": [
			    {
			      "binding": "KV",
			      "id": "random-id"
			    }
			  ]
			}"
		`);
		expect(await readFile("wrangler.json", "utf8")).toMatchInlineSnapshot(
			`
			"{
				"compatibility_date": "2022-01-12",
				"name": "worker",
				"env": {
					"testEnv": {
						"kv_namespaces": [
							{
								"binding": "KV",
								"id": "random-id",
								"remote": true
							}
						]
					}
				}
			}"
		`
		);
	});

	it("interactive: file update after answering yes-but", async ({ expect }) => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

		setIsTTY(true);
		mockConfirm({
			text: "Would you like Wrangler to add it on your behalf?",
			result: true,
		});

		mockPrompt({
			text: "What binding name would you like to use?",
			result: "HELLO",
		});
		mockConfirm({
			text: "For local dev, do you want to connect to the remote resource instead of a local resource?",
			result: false,
		});

		await createdResourceConfig(
			"kv_namespaces",
			(name) => ({ binding: name ?? "KV", id: "random-id" }),
			"wrangler.json",
			undefined
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
			{
			  "kv_namespaces": [
			    {
			      "binding": "KV",
			      "id": "random-id"
			    }
			  ]
			}"
		`);
		expect(await readFile("wrangler.json", "utf8")).toMatchInlineSnapshot(
			`
			"{
				"compatibility_date": "2022-01-12",
				"name": "worker",
				"kv_namespaces": [
					{
						"binding": "HELLO",
						"id": "random-id"
					}
				]
			}"
		`
		);
	});

	it("interactive: no prompts & no file update for toml", async ({
		expect,
	}) => {
		writeWranglerConfig({ name: "worker" }, "wrangler.toml");

		setIsTTY(true);

		await createdResourceConfig(
			"kv_namespaces",
			(name) => ({ binding: name ?? "KV", id: "random-id" }),
			"wrangler.toml",
			undefined
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
			[[kv_namespaces]]
			binding = "KV"
			id = "random-id"
			"
		`);
		expect(await readFile("wrangler.toml", "utf8")).toMatchInlineSnapshot(
			`
			"compatibility_date = "2022-01-12"
			name = "worker"
			"
		`
		);
	});

	it("interactive: no prompts & no file update for no config file", async ({
		expect,
	}) => {
		setIsTTY(true);

		await createdResourceConfig(
			"kv_namespaces",
			(name) => ({ binding: name ?? "KV", id: "random-id" }),
			undefined,
			undefined
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
			{
			  "kv_namespaces": [
			    {
			      "binding": "KV",
			      "id": "random-id"
			    }
			  ]
			}"
		`);
		await expect(readFile("wrangler.json", "utf8")).rejects.toThrowError(
			"ENOENT"
		);
	});

	it("logs correct binding type", async ({ expect }) => {
		writeWranglerConfig({ name: "worker" }, "wrangler.json");

		await createdResourceConfig(
			"d1_databases",
			() => ({
				binding: "D1",
				database_id: "database_id",
			}),
			"wrangler.json",
			undefined
		);
		expect(std.out).toMatchInlineSnapshot(`
			"To access your new D1 Database in your Worker, add the following snippet to your configuration file:
			{
			  "d1_databases": [
			    {
			      "binding": "D1",
			      "database_id": "database_id"
			    }
			  ]
			}
			? Would you like Wrangler to add it on your behalf?
			🤖 Using fallback value in non-interactive context: no"
		`);
	});

	describe("defaults", () => {
		it("no prompts if all defaults provided", async ({ expect }) => {
			writeWranglerConfig({ name: "worker" }, "wrangler.json");

			setIsTTY(true);

			await createdResourceConfig(
				"kv_namespaces",
				(name) => ({ binding: name ?? "KV", id: "random-id" }),
				"wrangler.json",
				undefined,
				{
					binding: "HELLO",
					updateConfig: true,
					useRemote: false,
				}
			);
			expect(std.out).toMatchInlineSnapshot(`
				"To access your new KV Namespace in your Worker, add the following snippet to your configuration file:
				{
				  "kv_namespaces": [
				    {
				      "binding": "HELLO",
				      "id": "random-id"
				    }
				  ]
				}"
			`);
			expect(await readFile("wrangler.json", "utf8")).toMatchInlineSnapshot(
				`
				"{
					"compatibility_date": "2022-01-12",
					"name": "worker",
					"kv_namespaces": [
						{
							"binding": "HELLO",
							"id": "random-id"
						}
					]
				}"
			`
			);
		});
	});
});
