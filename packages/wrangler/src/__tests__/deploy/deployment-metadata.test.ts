import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, vi } from "vitest";
import { collectDeploymentMetadata } from "../../deploy/deployment-metadata";
import { runInTempDir } from "../helpers/run-in-tmp";

vi.mock("../../package-manager", async (importOriginal) => ({
	...(await importOriginal()),
	sniffUserAgent: () => "npm",
}));

describe("collectDeploymentMetadata", () => {
	runInTempDir();

	it("should collect wrangler version and package manager", async ({
		expect,
	}) => {
		fs.writeFileSync(
			"package.json",
			JSON.stringify({ name: "test-project" }, null, 2)
		);

		const metadata = await collectDeploymentMetadata(process.cwd());

		expect(metadata.wrangler_version).toBeDefined();
		expect(typeof metadata.wrangler_version).toBe("string");
		expect(metadata.package_manager).toBe("npm");
	});

	describe("project_dependencies", () => {
		it("should return undefined when no package.json exists", async ({
			expect,
		}) => {
			// Don't create any package.json

			const metadata = await collectDeploymentMetadata(process.cwd());

			expect(metadata.project_dependencies).toBeUndefined();
		});

		it("should return undefined when package.json has no dependencies", async ({
			expect,
		}) => {
			fs.writeFileSync(
				"package.json",
				JSON.stringify({ name: "test-project" }, null, 2)
			);

			const metadata = await collectDeploymentMetadata(process.cwd());

			expect(metadata.project_dependencies).toBeUndefined();
		});

		it("should skip workspace dependencies", async ({ expect }) => {
			fs.writeFileSync(
				"package.json",
				JSON.stringify(
					{
						name: "test-project",
						dependencies: {
							"local-package": "workspace:*",
						},
					},
					null,
					2
				)
			);

			const metadata = await collectDeploymentMetadata(process.cwd());

			// Should be undefined because we only have a workspace dependency
			expect(metadata.project_dependencies).toBeUndefined();
		});

		it("should collect public package dependencies", async ({ expect }) => {
			// Create a mock node_modules structure with a public package
			const nodeModulesPath = path.join(process.cwd(), "node_modules");
			const packagePath = path.join(nodeModulesPath, "test-public-package");
			fs.mkdirSync(packagePath, { recursive: true });
			fs.writeFileSync(
				path.join(packagePath, "index.js"),
				"module.exports = {}"
			);
			fs.writeFileSync(
				path.join(packagePath, "package.json"),
				JSON.stringify(
					{
						name: "test-public-package",
						version: "1.2.3",
					},
					null,
					2
				)
			);

			fs.writeFileSync(
				"package.json",
				JSON.stringify(
					{
						name: "test-project",
						dependencies: {
							"test-public-package": "^1.0.0",
						},
					},
					null,
					2
				)
			);

			const metadata = await collectDeploymentMetadata(process.cwd());

			expect(metadata.project_dependencies).toEqual({
				"test-public-package": {
					package_json_version: "^1.0.0",
					installed_version: "1.2.3",
				},
			});
		});

		it("should skip private packages", async ({ expect }) => {
			// Create a mock node_modules structure with a private package
			const nodeModulesPath = path.join(process.cwd(), "node_modules");
			const packagePath = path.join(
				nodeModulesPath,
				"@company/private-package"
			);
			fs.mkdirSync(packagePath, { recursive: true });
			fs.writeFileSync(
				path.join(packagePath, "index.js"),
				"module.exports = {}"
			);
			fs.writeFileSync(
				path.join(packagePath, "package.json"),
				JSON.stringify(
					{
						name: "@company/private-package",
						version: "2.0.0",
						private: true,
					},
					null,
					2
				)
			);

			fs.writeFileSync(
				"package.json",
				JSON.stringify(
					{
						name: "test-project",
						dependencies: {
							"@company/private-package": "^2.0.0",
						},
					},
					null,
					2
				)
			);

			const metadata = await collectDeploymentMetadata(process.cwd());
			expect(metadata.project_dependencies).toBeUndefined();
		});

		it("should not include devDependencies", async ({ expect }) => {
			const nodeModulesPath = path.join(process.cwd(), "node_modules");
			const packagePath = path.join(nodeModulesPath, "dev-only-package");
			fs.mkdirSync(packagePath, { recursive: true });
			fs.writeFileSync(
				path.join(packagePath, "index.js"),
				"module.exports = {}"
			);
			fs.writeFileSync(
				path.join(packagePath, "package.json"),
				JSON.stringify(
					{
						name: "dev-only-package",
						version: "3.0.0",
					},
					null,
					2
				)
			);

			fs.writeFileSync(
				"package.json",
				JSON.stringify(
					{
						name: "test-project",
						devDependencies: {
							"dev-only-package": "^3.0.0",
						},
					},
					null,
					2
				)
			);

			const metadata = await collectDeploymentMetadata(process.cwd());
			expect(metadata.project_dependencies).toBeUndefined();
		});

		it("should skip dependencies that cannot be resolved", async ({
			expect,
		}) => {
			// Create project package.json with a dependency that doesn't exist in node_modules
			fs.writeFileSync(
				"package.json",
				JSON.stringify(
					{
						name: "test-project",
						dependencies: {
							"nonexistent-package": "^1.0.0",
						},
					},
					null,
					2
				)
			);

			const metadata = await collectDeploymentMetadata(process.cwd());
			expect(metadata.project_dependencies).toBeUndefined();
		});

		it("should handle mixed dependencies correctly", async ({ expect }) => {
			const nodeModulesPath = path.join(process.cwd(), "node_modules");

			// Create a public package
			const publicPath = path.join(nodeModulesPath, "public-pkg");
			fs.mkdirSync(publicPath, { recursive: true });
			fs.writeFileSync(
				path.join(publicPath, "index.js"),
				"module.exports = {}"
			);
			fs.writeFileSync(
				path.join(publicPath, "package.json"),
				JSON.stringify({ name: "public-pkg", version: "1.0.0" }, null, 2)
			);
			// Create a private package
			const privatePath = path.join(nodeModulesPath, "private-pkg");
			fs.mkdirSync(privatePath, { recursive: true });
			fs.writeFileSync(
				path.join(privatePath, "index.js"),
				"module.exports = {}"
			);
			fs.writeFileSync(
				path.join(privatePath, "package.json"),
				JSON.stringify(
					{ name: "private-pkg", version: "2.0.0", private: true },
					null,
					2
				)
			);

			fs.writeFileSync(
				"package.json",
				JSON.stringify(
					{
						name: "test-project",
						dependencies: {
							"public-pkg": "^1.0.0",
							"private-pkg": "^2.0.0",
							"workspace-pkg": "workspace:^",
							"nonexistent-pkg": "^3.0.0",
						},
					},
					null,
					2
				)
			);

			const metadata = await collectDeploymentMetadata(process.cwd());

			expect(metadata.project_dependencies).toEqual({
				"public-pkg": {
					package_json_version: "^1.0.0",
					installed_version: "1.0.0",
				},
			});
		});
	});
});
