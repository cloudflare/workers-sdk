import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { isBuild, page } from "../../__test-utils__";

export function testPageContent() {
	test("the page content has been server side rendered by react", async () => {
		const h1Content = await page.textContent("h1");
		expect(h1Content).toEqual("Server Side React");
		const pContent = await page.textContent("p");
		expect(pContent).toEqual(
			"This page was server side rendered by using directly 'renderToString' from 'react-dom/server'"
		);
	});
}

test.skipIf(!isBuild)(
	"the build output does not include react development code (such is tree-shaken away)",
	async () => {
		const outputJs = readFileSync("./dist/worker/index.js", "utf8");
		expect(outputJs).not.toContain("react-dom.development.js");
		// the react development code links to the facebook/react repo in a few places
		expect(outputJs).not.toContain("https://github.com/facebook/react");
	}
);
