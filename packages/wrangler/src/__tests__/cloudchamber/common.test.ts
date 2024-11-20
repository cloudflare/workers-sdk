import { parseImageName } from "../../cloudchamber/common";

describe("parseImageName", () => {
	it("works", () => {
		type TestCase = [input: string, name: string | undefined, tag: string | undefined, err: boolean];
		const cases: TestCase[] = [
			// Multiple domains
			["docker.io/cloudflare/hello-world:1.0", "docker.io/cloudflare/hello-world", "1.0", false],

			// Domain with port
			["localhost:7777/web:local", "localhost:7777/web", "local", false],

			// No domain
			["hello-world:1.0", "hello-world", "1.0", false],

			// Invalid name
			["bad image name:1", undefined, undefined, true],

			// Missing tag
			["no-tag", undefined, undefined, true],
			["no-tag:", undefined, undefined, true],

			// Invalid tag
			["no-tag::", undefined, undefined, true],

			// latest tag
			["name:latest", undefined, undefined, true],

			// Too many colons
			["registry.com:1234/foobar:4444/image:sometag", undefined, undefined, true],
		];

		for (const c of cases) {
			let [input, name, tag, isErr] = c;
			let result = parseImageName(input);
			expect(result.name).toEqual(name);
			expect(result.tag).toEqual(tag);
			expect(result.err !== undefined).toEqual(isErr);
		}
	});
});
