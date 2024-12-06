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
			Writing the value \\"value\\" to key \\"val\\" on namespace some-namespace-id."
		`);

			await runWrangler(
				`kv key get val --namespace-id some-namespace-id --text`
			);
			expect(std.out).toMatchInlineSnapshot(`
			"Value not found
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
			"Writing the value \\"value\\" to key \\"val\\" on namespace some-namespace-id.
			value"
		`);
			await runWrangler(`kv key delete val --namespace-id some-namespace-id`);
			expect(std.out).toMatchInlineSnapshot(`
			"Writing the value \\"value\\" to key \\"val\\" on namespace some-namespace-id.
			value
			Deleting the key \\"val\\" on namespace some-namespace-id."
		`);

			await runWrangler(
				`kv key get val --namespace-id some-namespace-id --text`
			);
			expect(std.out).toMatchInlineSnapshot(`
			"Writing the value \\"value\\" to key \\"val\\" on namespace some-namespace-id.
			value
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
			];
			writeFileSync("./keys.json", JSON.stringify(keyValues));
			await runWrangler(
				`kv bulk put keys.json --namespace-id bulk-namespace-id`
			);
			expect(std.out).toMatchInlineSnapshot(`
			"[]
			Success!"
		`);

			await runWrangler(
				`kv key get test --namespace-id bulk-namespace-id --text`
			);
			expect(std.out).toMatchInlineSnapshot(`
			"[]
			Success!
			value"
		`);

			await runWrangler(`kv key list --namespace-id bulk-namespace-id`);
			expect(std.out).toMatchInlineSnapshot(`
			"[]
			Success!
			value
			[
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
			"Success!
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
			"Success!
			[
			  {
			    \\"name\\": \\"hello\\"
			  },
			  {
			    \\"name\\": \\"test\\"
			  }
			]
			Success!"
		`);

			await runWrangler(`kv key list --namespace-id bulk-namespace-id`);
			expect(std.out).toMatchInlineSnapshot(`
			"Success!
			[
			  {
			    \\"name\\": \\"hello\\"
			  },
			  {
			    \\"name\\": \\"test\\"
			  }
			]
			Success!
			[]"
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
			"Writing the value \\"value\\" to key \\"val\\" on namespace some-namespace-id.
			Writing the value \\"persistValue\\" to key \\"val\\" on namespace some-namespace-id."
		`);

			await runWrangler(
				`kv key get val --namespace-id some-namespace-id --text`
			);
			expect(std.out).toMatchInlineSnapshot(`
			"Writing the value \\"value\\" to key \\"val\\" on namespace some-namespace-id.
			Writing the value \\"persistValue\\" to key \\"val\\" on namespace some-namespace-id.
			value"
		`);

			await runWrangler(
				`kv key get val --namespace-id some-namespace-id --text --persist-to ./persistdir`
			);
			expect(std.out).toMatchInlineSnapshot(`
			"Writing the value \\"value\\" to key \\"val\\" on namespace some-namespace-id.
			Writing the value \\"persistValue\\" to key \\"val\\" on namespace some-namespace-id.
			value
			persistValue"
		`);
		});
	});
});
