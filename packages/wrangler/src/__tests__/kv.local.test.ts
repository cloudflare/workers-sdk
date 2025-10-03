import { writeFileSync } from "node:fs";
import { vi } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

vi.unmock("undici");

describe("wrangler", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	describe("local", () => {
		it("should put local kv storage", async () => {
			await runWrangler(
				`kv key get val --namespace-id some-namespace-id  --text`
			);
			expect(std.out).toMatchInlineSnapshot(`"Value not found"`);

			await runWrangler(
				`kv key put val value --namespace-id some-namespace-id `
			);
			expect(std.out).toMatchInlineSnapshot(`
				"Value not found

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Writing the value \\"value\\" to key \\"val\\" on namespace some-namespace-id."
			`);

			await runWrangler(
				`kv key get val --namespace-id some-namespace-id --text`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"Value not found

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Writing the value \\"value\\" to key \\"val\\" on namespace some-namespace-id.
				value"
			`);
		});

		it("should list local kv storage", async () => {
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
			expect(std.out).toMatchInlineSnapshot(`
				"[]

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!
				[
				  {
				    \\"name\\": \\"a\\"
				  },
				  {
				    \\"name\\": \\"a/b\\"
				  },
				  {
				    \\"name\\": \\"a/c\\"
				  },
				  {
				    \\"name\\": \\"b\\"
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

			expect(std.out).toMatchInlineSnapshot(`
				"[]

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!
				[
				  {
				    \\"name\\": \\"a\\"
				  },
				  {
				    \\"name\\": \\"a/b\\"
				  },
				  {
				    \\"name\\": \\"a/c\\"
				  },
				  {
				    \\"name\\": \\"b\\"
				  }
				]
				[
				  {
				    \\"name\\": \\"a\\"
				  },
				  {
				    \\"name\\": \\"a/b\\"
				  },
				  {
				    \\"name\\": \\"a/c\\"
				  }
				]
				[
				  {
				    \\"name\\": \\"a/b\\"
				  }
				]
				[]"
			`);
		});

		it("should delete local kv storage", async () => {
			await runWrangler(
				`kv key put val value --namespace-id some-namespace-id`
			);
			await runWrangler(
				`kv key get val --namespace-id some-namespace-id --text`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Writing the value \\"value\\" to key \\"val\\" on namespace some-namespace-id.
				value"
			`);
			await runWrangler(`kv key delete val --namespace-id some-namespace-id`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Writing the value \\"value\\" to key \\"val\\" on namespace some-namespace-id.
				value

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Deleting the key \\"val\\" on namespace some-namespace-id."
			`);

			await runWrangler(
				`kv key get val --namespace-id some-namespace-id --text`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Writing the value \\"value\\" to key \\"val\\" on namespace some-namespace-id.
				value

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Deleting the key \\"val\\" on namespace some-namespace-id.
				Value not found"
			`);
		});

		it("should put local bulk kv storage", async () => {
			await runWrangler(`kv key list --namespace-id bulk-namespace-id`);
			expect(std.out).toMatchInlineSnapshot(`"[]"`);

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
			expect(std.out).toMatchInlineSnapshot(`
				"[]

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!"
			`);

			await runWrangler(
				`kv key get test --namespace-id bulk-namespace-id --text`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"[]

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!
				value"
			`);

			await runWrangler(
				`kv key get encoded --namespace-id bulk-namespace-id --text`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"[]

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!
				value
				some raw data"
			`);

			await runWrangler(`kv key list --namespace-id bulk-namespace-id`);
			expect(std.out).toMatchInlineSnapshot(`
				"[]

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!
				value
				some raw data
				[
				  {
				    \\"name\\": \\"encoded\\"
				  },
				  {
				    \\"name\\": \\"hello\\"
				  },
				  {
				    \\"name\\": \\"test\\"
				  }
				]"
			`);
		});

		it("should delete local bulk kv storage", async () => {
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
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!
				[
				  {
				    \\"name\\": \\"hello\\"
				  },
				  {
				    \\"name\\": \\"test\\"
				  }
				]"
			`);
			const keys = ["hello", "test"];
			writeFileSync("./keys.json", JSON.stringify(keys));
			await runWrangler(
				`kv bulk delete keys.json --namespace-id bulk-namespace-id --force`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!
				[
				  {
				    \\"name\\": \\"hello\\"
				  },
				  {
				    \\"name\\": \\"test\\"
				  }
				]

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!"
			`);

			await runWrangler(`kv key list --namespace-id bulk-namespace-id`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!
				[
				  {
				    \\"name\\": \\"hello\\"
				  },
				  {
				    \\"name\\": \\"test\\"
				  }
				]

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!
				[]"
			`);
		});

		it("should delete local bulk kv storage ({ name })", async () => {
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
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!
				[
				  {
				    \\"name\\": \\"hello\\"
				  },
				  {
				    \\"name\\": \\"test\\"
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
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!
				[
				  {
				    \\"name\\": \\"hello\\"
				  },
				  {
				    \\"name\\": \\"test\\"
				  }
				]

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!"
			`);

			await runWrangler(`kv key list --namespace-id bulk-namespace-id`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!
				[
				  {
				    \\"name\\": \\"hello\\"
				  },
				  {
				    \\"name\\": \\"test\\"
				  }
				]

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!
				[]"
			`);
		});

		it("should get local bulk kv storage", async () => {
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
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!
				[
				  {
				    \\"name\\": \\"hello\\"
				  },
				  {
				    \\"name\\": \\"test\\"
				  }
				]"
			`);
			const keys = ["hello", "test"];
			writeFileSync("./keys.json", JSON.stringify(keys));
			await runWrangler(
				`kv bulk get keys.json --namespace-id bulk-namespace-id`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Success!
				[
				  {
				    \\"name\\": \\"hello\\"
				  },
				  {
				    \\"name\\": \\"test\\"
				  }
				]
				{
				  \\"hello\\": {
				    \\"value\\": \\"world\\"
				  },
				  \\"test\\": {
				    \\"value\\": \\"value\\"
				  }
				}

				Success!"
			`);
		});

		it("should follow persist-to for local kv storage", async () => {
			await runWrangler(
				`kv key put val value --namespace-id some-namespace-id`
			);

			await runWrangler(
				`kv key put val persistValue --namespace-id some-namespace-id --persist-to ./persistdir`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Writing the value \\"value\\" to key \\"val\\" on namespace some-namespace-id.

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Writing the value \\"persistValue\\" to key \\"val\\" on namespace some-namespace-id."
			`);

			await runWrangler(
				`kv key get val --namespace-id some-namespace-id --text`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Writing the value \\"value\\" to key \\"val\\" on namespace some-namespace-id.

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Writing the value \\"persistValue\\" to key \\"val\\" on namespace some-namespace-id.
				value"
			`);

			await runWrangler(
				`kv key get val --namespace-id some-namespace-id --text --persist-to ./persistdir`
			);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Writing the value \\"value\\" to key \\"val\\" on namespace some-namespace-id.

				 ⛅️ wrangler x.x.x
				──────────────────
				Resource location: local
				Use --remote if you want to access the remote instance.

				Writing the value \\"persistValue\\" to key \\"val\\" on namespace some-namespace-id.
				value
				persistValue"
			`);
		});
	});
});
