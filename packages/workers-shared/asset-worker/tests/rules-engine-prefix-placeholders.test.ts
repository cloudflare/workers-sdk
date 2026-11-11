import { describe, test } from "vitest";
import { generateRulesMatcher, replacer } from "../src/utils/rules-engine";

describe("prefix-colliding placeholders", () => {
	test("replacer substitutes each placeholder whole", ({ expect }) => {
		expect(replacer("/new/:a/:ab", { a: "X", ab: "Y" })).toBe("/new/X/Y");
		expect(replacer("/dest/:id/:id_2", { id: "1", id_2: "2" })).toBe(
			"/dest/1/2"
		);
	});

	test("rule with :id and :id_2 is not silently dropped", ({ expect }) => {
		const matcher = generateRulesMatcher(
			{ "/p/:id/:id_2": "/dest/:id/:id_2" },
			(match, replacements) => replacer(match, replacements)
		);
		expect(
			matcher({ request: new Request("https://example.com/p/1/2") })
		).toEqual(["/dest/1/2"]);
	});
});
