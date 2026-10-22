import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import getReleasePlan from "@changesets/get-release-plan";
import { afterEach, beforeEach, describe, it } from "vitest";
import config from "../../../.changeset/config.json";
import {
	findPackages,
	validateDevDependencyReleases,
} from "../validate-changesets";
import type { PackageJSON } from "../validate-changesets";

describe("validateDevDependencyReleases()", () => {
	it("reports missing public consumers once, identifying all their released devDependencies", ({
		expect,
	}) => {
		const packages = new Map<string, PackageJSON>([
			[
				"consumer",
				{
					name: "consumer",
					devDependencies: {
						"dependency-b": "workspace:^",
						"dependency-a": "workspace:*",
						unreleased: "workspace:*",
					},
				},
			],
		]);

		expect(
			validateDevDependencyReleases(packages, [
				{ name: "dependency-b", type: "minor" },
				{ name: "dependency-a", type: "patch" },
				{ name: "consumer", type: "none" },
			])
		).toEqual([
			'Package "consumer" must be released because it has released workspace devDependencies: "dependency-a", "dependency-b". Add a patch (or higher) changeset entry for "consumer".',
		]);
	});

	it.for(["patch", "minor", "major"])(
		"accepts a consumer with a %s release",
		(type, { expect }) => {
			expect(
				validateDevDependencyReleases(
					new Map([
						[
							"consumer",
							{
								name: "consumer",
								devDependencies: { dependency: "workspace:*" },
							},
						],
					]),
					[
						{ name: "dependency", type: "patch" },
						{ name: "consumer", type },
					]
				)
			).toEqual([]);
		}
	);

	it("ignores dependencies with no version bump, published dependencies, and private consumers", ({
		expect,
	}) => {
		const packages: PackageJSON[] = [
			{ name: "no-dev-dependencies" },
			{ name: "unreleased", devDependencies: { dependency: "workspace:*" } },
			{
				name: "published",
				devDependencies: { released: "1.0.0", alias: "npm:released@1.0.0" },
			},
			{
				name: "private",
				private: true,
				devDependencies: { released: "workspace:*" },
			},
			{
				name: "deployable",
				private: true,
				scripts: { deploy: "wrangler deploy" },
				devDependencies: { released: "workspace:*" },
			},
		];

		expect(
			validateDevDependencyReleases(
				new Map(packages.map((pkg) => [pkg.name, pkg])),
				[
					{ name: "dependency", type: "none" },
					{ name: "released", type: "patch" },
				]
			)
		).toEqual([]);
	});

	it("catches create-cloudflare when workers-utils is released and excludes private deployment packages", ({
		expect,
	}) => {
		const errors = validateDevDependencyReleases(findPackages(), [
			{ name: "@cloudflare/workers-utils", type: "patch" },
			{ name: "wrangler", type: "patch" },
		]);

		expect(errors).toContain(
			'Package "create-cloudflare" must be released because it has released workspace devDependencies: "@cloudflare/workers-utils", "wrangler". Add a patch (or higher) changeset entry for "create-cloudflare".'
		);
		expect(errors.join("\n")).not.toContain("@cloudflare/devprod-status-bot");
	});
});

describe("Changesets release plan integration", () => {
	let directory: string;

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), "dev-dependency-changesets-"));
		mkdirSync(join(directory, ".changeset"));
		writeFileSync(
			join(directory, "package.json"),
			JSON.stringify({ name: "test-workspace", private: true })
		);
		writeFileSync(
			join(directory, "pnpm-workspace.yaml"),
			"packages:\n  - packages/*\n"
		);
		writeFileSync(
			join(directory, ".changeset/config.json"),
			JSON.stringify(config)
		);
	});

	afterEach(() => {
		// eslint-disable-next-line workers-sdk/no-direct-recursive-rm -- remove the temporary workspace
		rmSync(directory, { recursive: true, force: true });
	});

	it("checks transitive devDependants, accepts separate changesets, and respects automatic runtime bumps", async ({
		expect,
	}) => {
		const manifests: PackageJSON[] = [
			{ name: "dependency" },
			{
				name: "runtime-consumer",
				dependencies: { dependency: "workspace:*" },
				devDependencies: { dependency: "workspace:*" },
			},
			{
				name: "dev-consumer",
				devDependencies: { "runtime-consumer": "workspace:*" },
			},
			{
				name: "transitive-runtime-consumer",
				optionalDependencies: { "dev-consumer": "workspace:*" },
			},
			{
				name: "transitive-dev-consumer",
				devDependencies: { "transitive-runtime-consumer": "workspace:^" },
			},
		];
		const packages = new Map(manifests.map((pkg) => [pkg.name, pkg]));
		for (const pkg of manifests) {
			mkdirSync(join(directory, "packages", pkg.name), { recursive: true });
			writeFileSync(
				join(directory, "packages", pkg.name, "package.json"),
				JSON.stringify({ version: "1.0.0", ...pkg })
			);
		}
		writeFileSync(
			join(directory, ".changeset/dependency.md"),
			'---\n"dependency": patch\n---\n\nFix the dependency\n'
		);

		const initialPlan = await getReleasePlan(directory);
		expect(initialPlan.releases).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "runtime-consumer", type: "patch" }),
				expect.objectContaining({ name: "dev-consumer", type: "none" }),
			])
		);
		expect(
			validateDevDependencyReleases(packages, initialPlan.releases)
		).toEqual([
			'Package "dev-consumer" must be released because it has released workspace devDependencies: "runtime-consumer". Add a patch (or higher) changeset entry for "dev-consumer".',
		]);

		writeFileSync(
			join(directory, ".changeset/dev-consumer.md"),
			'---\n"dev-consumer": patch\n---\n\nUpdate the bundled dependency\n'
		);
		const transitivePlan = await getReleasePlan(directory);
		expect(
			validateDevDependencyReleases(packages, transitivePlan.releases)
		).toEqual([
			'Package "transitive-dev-consumer" must be released because it has released workspace devDependencies: "transitive-runtime-consumer". Add a patch (or higher) changeset entry for "transitive-dev-consumer".',
		]);

		writeFileSync(
			join(directory, ".changeset/transitive-dev-consumer.md"),
			'---\n"transitive-dev-consumer": patch\n---\n\nUpdate the bundled dependency\n'
		);
		const completePlan = await getReleasePlan(directory);
		expect(
			validateDevDependencyReleases(packages, completePlan.releases)
		).toEqual([]);
	});
});
