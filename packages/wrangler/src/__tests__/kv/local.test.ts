import { writeFileSync } from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockProcess } from "../helpers/mock-process";
import { runWrangler } from "../helpers/run-wrangler";

vi.unmock("undici");

describe("kv", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const proc = mockProcess();

	describe("local", () => {
		it("should put local kv storage", async ({ expect }) => {
			await runWrangler(
				`kv key get val --namespace-id some-namespace-id  --text`
			);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`"Value not found"`);

			await runWrangler(
				`kv key put val value --namespace-id some-namespace-id `
			);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local

				Use --remote if you want to access the remote instance.

				Writing the value "value" to key "val" on namespace id: "some-namespace-id"."
			`);

			await runWrangler(
				`kv key get val --namespace-id some-namespace-id --text`
			);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`"value"`);
		});

		it("should list local kv storage", async ({ expect }) => {
			await runWrangler(`kv key list --namespace-id some-namespace-id`);
			expect(std.out).toMatchInlineSnapshot(`"[]"`);
			const keyValues = [
				{
					key: "a",
					value: "value",
				},
				{
					key: "a/b",
					value: "value",
				},
				{
					key: "a/c",
					value: "value",
				},
				{
					key: "b",
					value: "value",
				},
			];
			writeFileSync("./keys.json", JSON.stringify(keyValues));
			await runWrangler(
				`kv bulk put keys.json --namespace-id some-namespace-id`
			);

			await runWrangler(`kv key list --namespace-id some-namespace-id`);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`
				"[]

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local

				Use --remote if you want to access the remote instance.

				Success!
				[
				  {
				    "name": "a"
				  },
				  {
				    "name": "a/b"
				  },
				  {
				    "name": "a/c"
				  },
				  {
				    "name": "b"
				  }
				]"
			`);

			await runWrangler(
				`kv key list --namespace-id some-namespace-id --prefix a`
			);
			await runWrangler(
				`kv key list --namespace-id some-namespace-id --prefix a/b`
			);
			await runWrangler(
				`kv key list --namespace-id some-namespace-id --prefix abc`
			);

			expect(std.getAndClearOut()).toMatchInlineSnapshot(`
				"[
				  {
				    "name": "a"
				  },
				  {
				    "name": "a/b"
				  },
				  {
				    "name": "a/c"
				  }
				]
				[
				  {
				    "name": "a/b"
				  }
				]
				[]"
			`);
		});

		it("should delete local kv storage", async ({ expect }) => {
			await runWrangler(
				`kv key put val value --namespace-id some-namespace-id`
			);
			await runWrangler(
				`kv key get val --namespace-id some-namespace-id --text`
			);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local

				Use --remote if you want to access the remote instance.

				Writing the value "value" to key "val" on namespace id: "some-namespace-id".
				value"
			`);
			await runWrangler(`kv key delete val --namespace-id some-namespace-id`);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local

				Use --remote if you want to access the remote instance.

				Deleting the key "val" on namespace id: "some-namespace-id"."
			`);

			await runWrangler(
				`kv key get val --namespace-id some-namespace-id --text`
			);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`"Value not found"`);
		});

		it("should put local bulk kv storage", async ({ expect }) => {
			await runWrangler(`kv key list --namespace-id bulk-namespace-id`);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`"[]"`);

			const keyValues = [
				{
					key: "hello",
					value: "world",
				},
				{
					key: "test",
					value: "value",
				},
				{
					key: "encoded",
					value: Buffer.from("some raw data").toString("base64"),
					base64: true,
				},
			];
			writeFileSync("./keys.json", JSON.stringify(keyValues));
			await runWrangler(
				`kv bulk put keys.json --namespace-id bulk-namespace-id`
			);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local

				Use --remote if you want to access the remote instance.

				Success!"
			`);

			await runWrangler(
				`kv key get test --namespace-id bulk-namespace-id --text`
			);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`"value"`);

			await runWrangler(
				`kv key get encoded --namespace-id bulk-namespace-id --text`
			);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`"some raw data"`);

			await runWrangler(`kv key list --namespace-id bulk-namespace-id`);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`
				"[
				  {
				    "name": "encoded"
				  },
				  {
				    "name": "hello"
				  },
				  {
				    "name": "test"
				  }
				]"
			`);
		});

		it("should put binary values from base64 in local bulk kv storage", async ({
			expect,
		}) => {
			// Bytes that are not valid UTF-8, so a UTF-8 round trip would replace
			// them with U+FFFD. The first eight are the PNG signature.
			const binary = Buffer.from([
				0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x80, 0xff, 0xfe,
			]);
			const keyValues = [
				{
					key: "binary",
					value: binary.toString("base64"),
					base64: true,
				},
			];
			writeFileSync("./binary-keys.json", JSON.stringify(keyValues));
			await runWrangler(
				`kv bulk put binary-keys.json --namespace-id binary-namespace-id`
			);

			await runWrangler(`kv key get binary --namespace-id binary-namespace-id`);
			expect(proc.write).toEqual(binary);
		});

		it("should delete local bulk kv storage", async ({ expect }) => {
			const keyValues = [
				{
					key: "hello",
					value: "world",
				},
				{
					key: "test",
					value: "value",
				},
			];
			writeFileSync("./keys.json", JSON.stringify(keyValues));
			await runWrangler(
				`kv bulk put keys.json --namespace-id bulk-namespace-id`
			);
			await runWrangler(`kv key list --namespace-id bulk-namespace-id`);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local

				Use --remote if you want to access the remote instance.

				Success!
				[
				  {
				    "name": "hello"
				  },
				  {
				    "name": "test"
				  }
				]"
			`);
			const keys = ["hello", "test"];
			writeFileSync("./keys.json", JSON.stringify(keys));
			await runWrangler(
				`kv bulk delete keys.json --namespace-id bulk-namespace-id --force`
			);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local

				Use --remote if you want to access the remote instance.

				Success!"
			`);

			await runWrangler(`kv key list --namespace-id bulk-namespace-id`);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`"[]"`);
		});

		it("should delete local bulk kv storage ({ name })", async ({ expect }) => {
			const keyValues = [
				{
					key: "hello",
					value: "world",
				},
				{
					key: "test",
					value: "value",
				},
			];
			writeFileSync("./keys.json", JSON.stringify(keyValues));
			await runWrangler(
				`kv bulk put keys.json --namespace-id bulk-namespace-id`
			);
			await runWrangler(`kv key list --namespace-id bulk-namespace-id`);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local

				Use --remote if you want to access the remote instance.

				Success!
				[
				  {
				    "name": "hello"
				  },
				  {
				    "name": "test"
				  }
				]"
			`);
			const keys = [
				{
					name: "hello",
				},
				{
					name: "test",
				},
			];
			writeFileSync("./keys.json", JSON.stringify(keys));
			await runWrangler(
				`kv bulk delete keys.json --namespace-id bulk-namespace-id --force`
			);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local

				Use --remote if you want to access the remote instance.

				Success!"
			`);

			await runWrangler(`kv key list --namespace-id bulk-namespace-id`);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`"[]"`);
		});

		it("should get local bulk kv storage", async ({ expect }) => {
			const keyValues = [
				{
					key: "hello",
					value: "world",
				},
				{
					key: "test",
					value: "value",
				},
			];
			writeFileSync("./keys.json", JSON.stringify(keyValues));
			await runWrangler(
				`kv bulk put keys.json --namespace-id bulk-namespace-id`
			);
			await runWrangler(`kv key list --namespace-id bulk-namespace-id`);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local

				Use --remote if you want to access the remote instance.

				Success!
				[
				  {
				    "name": "hello"
				  },
				  {
				    "name": "test"
				  }
				]"
			`);
			const keys = ["hello", "test"];
			writeFileSync("./keys.json", JSON.stringify(keys));
			await runWrangler(
				`kv bulk get keys.json --namespace-id bulk-namespace-id`
			);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`
				"{
				  "hello": {
				    "value": "world"
				  },
				  "test": {
				    "value": "value"
				  }
				}"
			`);
		});

		it("should follow persist-to for local kv storage", async ({ expect }) => {
			await runWrangler(
				`kv key put val value --namespace-id some-namespace-id`
			);

			await runWrangler(
				`kv key put val persistValue --namespace-id some-namespace-id --persist-to ./persistdir`
			);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local

				Use --remote if you want to access the remote instance.

				Writing the value "value" to key "val" on namespace id: "some-namespace-id".

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local

				Use --remote if you want to access the remote instance.

				Writing the value "persistValue" to key "val" on namespace id: "some-namespace-id"."
			`);

			await runWrangler(
				`kv key get val --namespace-id some-namespace-id --text`
			);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`"value"`);

			await runWrangler(
				`kv key get val --namespace-id some-namespace-id --text --persist-to ./persistdir`
			);
			expect(std.getAndClearOut()).toMatchInlineSnapshot(`"persistValue"`);
		});
	});
});
