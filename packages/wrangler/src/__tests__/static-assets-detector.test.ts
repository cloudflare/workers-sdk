import { detectStaticAssetDirectories } from "../deployment-bundle/static-assets-detector";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { seed } from "./helpers/seed";

describe("detectStaticAssetDirectories()", () => {
	runInTempDir();
	mockConsoleMethods();

	it("should detect dist directory", async () => {
		await seed({
			"dist/index.html": "<html></html>",
			"dist/style.css": "body { color: red; }",
		});

		const suggestions = detectStaticAssetDirectories();
		expect(suggestions).toEqual([
			{
				directory: "./dist",
				reason: "common build output directory",
			},
		]);
	});

	it("should detect multiple asset directories", async () => {
		await seed({
			"dist/index.html": "<html></html>",
			"build/app.js": "console.log('hello');",
			"public/favicon.ico": "fake-ico-content",
		});

		const suggestions = detectStaticAssetDirectories();
		expect(suggestions).toEqual([
			{
				directory: "./build",
				reason: "common build output directory",
			},
			{
				directory: "./dist",
				reason: "common build output directory",
			},
			{
				directory: "./public",
				reason: "common static assets directory",
			},
		]);
	});

	it("should not detect empty directories", async () => {
		await seed({
			"dist/": "",
			"build/": "",
		});

		const suggestions = detectStaticAssetDirectories();
		expect(suggestions).toEqual([]);
	});

	it("should detect Astro project with dist directory", async () => {
		await seed({
			"package.json": JSON.stringify({
				name: "my-astro-project",
				dependencies: {
					astro: "^4.0.0",
				},
			}),
			"astro.config.mjs": "export default {};",
			"dist/index.html": "<html></html>",
			"dist/style.css": "body { color: red; }",
		});

		const suggestions = detectStaticAssetDirectories();
		expect(suggestions).toContainEqual({
			directory: "./dist",
			reason: "detected astro.config project",
		});
	});

	it("should detect Next.js project with out directory", async () => {
		await seed({
			"package.json": JSON.stringify({
				name: "my-next-project",
				dependencies: {
					next: "^14.0.0",
				},
			}),
			"next.config.js": "module.exports = {};",
			"out/index.html": "<html></html>",
			"out/favicon.ico": "fake-ico-content",
		});

		const suggestions = detectStaticAssetDirectories();
		expect(suggestions).toContainEqual({
			directory: "./out",
			reason: "detected next.config project",
		});
	});

	it("should detect Vite project from package.json", async () => {
		await seed({
			"package.json": JSON.stringify({
				name: "my-vite-project",
				devDependencies: {
					vite: "^5.0.0",
				},
			}),
			"dist/index.html": "<html></html>",
			"dist/assets/main.js": "console.log('hello');",
		});

		const suggestions = detectStaticAssetDirectories();
		expect(suggestions).toContainEqual({
			directory: "./dist",
			reason: "detected package.json project",
		});
	});

	it("should detect Eleventy project", async () => {
		await seed({
			"package.json": JSON.stringify({
				name: "my-eleventy-project",
				devDependencies: {
					"@11ty/eleventy": "^2.0.0",
				},
			}),
			".eleventy.js": "module.exports = {};",
			"_site/index.html": "<html></html>",
			"_site/style.css": "body { color: red; }",
		});

		const suggestions = detectStaticAssetDirectories();
		expect(suggestions).toContainEqual({
			directory: "./_site",
			reason: "detected .eleventy project",
		});
	});

	it("should not duplicate suggestions", async () => {
		await seed({
			"package.json": JSON.stringify({
				name: "my-astro-project",
				dependencies: {
					astro: "^4.0.0",
				},
			}),
			"astro.config.mjs": "export default {};",
			"dist/index.html": "<html></html>",
		});

		const suggestions = detectStaticAssetDirectories();
		// Should only have one suggestion for dist, not duplicates
		const distSuggestions = suggestions.filter(s => s.directory === "./dist");
		expect(distSuggestions).toHaveLength(1);
	});

	it("should handle non-existent directories gracefully", async () => {
		await seed({
			"package.json": JSON.stringify({
				name: "my-project",
				dependencies: {
					astro: "^4.0.0",
				},
			}),
			// No dist directory created
		});

		const suggestions = detectStaticAssetDirectories();
		expect(suggestions).toEqual([]);
	});

	it("should handle invalid package.json gracefully", async () => {
		await seed({
			"package.json": "invalid json content",
			"dist/index.html": "<html></html>",
		});

		const suggestions = detectStaticAssetDirectories();
		expect(suggestions).toEqual([
			{
				directory: "./dist",
				reason: "common build output directory",
			},
		]);
	});
});