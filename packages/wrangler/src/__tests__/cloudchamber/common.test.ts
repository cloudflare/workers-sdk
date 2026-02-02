import { describe, expect, it } from "vitest";
import { parseImageName } from "../../commands/cloudchamber/common";

describe("parseImageName", () => {
	it("works", () => {
		type TestCase = [
			input: string,
			expected: { name?: string; tag?: string; digest?: string; err?: boolean },
		];
		const cases: TestCase[] = [
			// Multiple domains
			[
				"docker.io/cloudflare/hello-world:1.0",
				{ name: "docker.io/cloudflare/hello-world", tag: "1.0" },
			],

			// Domain with port
			[
				"localhost:7777/web:local",
				{ name: "localhost:7777/web", tag: "local" },
			],

			// No domain
			["hello-world:1.0", { name: "hello-world", tag: "1.0" }],

			// With sha256 digest
			[
				"hello/world:1.0@sha256:abcdef0123456789",
				{ name: "hello/world", tag: "1.0", digest: "abcdef0123456789" },
			],

			// sha256 digest but no tag
			[
				"hello/world@sha256:abcdef0123456789",
				{ name: "hello/world", digest: "sha256:abcdef0123456789" },
			],

			// Invalid name
			["bad image name:1", { err: true }],

			// Missing tag
			["no-tag", { err: true }],
			["no-tag:", { err: true }],

			// Invalid tag
			["no-tag::", { err: true }],

			// latest tag
			["name:latest", { err: true }],

			// Too many colons
			["registry.com:1234/foobar:4444/image:sometag", { err: true }],
		];

		for (const c of cases) {
			const [input, expected] = c;
			const result = parseImageName(input);
			expect(result.name).toEqual(expected.name);
			expect(result.tag).toEqual(expected.tag);
			expect(result.err !== undefined).toEqual(expected.err === true);
		}
	});
});
