import assert from "node:assert";
import { AutoConfigFrameworkConfigurationError } from "../errors";
import { getAllFrameworksInfos, staticFramework } from "./all-frameworks";
import { NoOpFramework } from "./no-op";
import type { AutoConfigTarget } from "../context";
import type { Framework } from "./framework-class";

export type { Framework, PackageJsonScriptsOverrides } from "./framework-class";

/**
 * Identifies whether a given id maps to a known framework's id
 *
 * @param frameworkId The target id to check
 * @param target The configuration target
 * @returns true if the id is that of a known framework, false otherwise
 */
export function isKnownFramework(
	frameworkId: string,
	target: AutoConfigTarget
): boolean {
	return getAllFrameworksInfos(target).some(({ id }) => id === frameworkId);
}

/**
 * Gets a class instance for a framework based on its id
 *
 * @param frameworkId The target framework's id
 * @param target The configuration target
 * @returns The class for the framework, defaulting to the static framework is the id is not recognized
 */
export function getFrameworkClassInstance(
	frameworkId: FrameworkInfo["id"],
	target: AutoConfigTarget
): Framework {
	const targetedFramework = getAllFrameworksInfos(target).find(
		(framework) => framework.id === frameworkId
	);
	const framework = targetedFramework ?? staticFramework;
	const targetClass =
		framework.supported === false ? NoOpFramework : framework.class;

	return new targetClass({ id: framework.id, name: framework.name });
}

/**
 * Checks whether a framework is supported by autoconfig.
 *
 * @param frameworkId The target framework's id
 * @param target The configuration target, defaults to cf
 * @returns a boolean indicating wether the framework is supported
 */
export function isFrameworkSupported(
	frameworkId: FrameworkInfo["id"],
	target: AutoConfigTarget = "cf"
): boolean {
	const targetedFramework = getAllFrameworksInfos(target).find(
		(framework) => framework.id === frameworkId
	);
	assert(
		targetedFramework,
		`Unexpected unknown framework id: ${JSON.stringify(frameworkId)}`
	);
	return targetedFramework.supported;
}

/**
 * Checks whether autoconfig sets up a framework for cf when migrating a Wrangler project.
 * Static projects, and frameworks that autoconfig cannot set up for cf, only get their
 * Worker config migrated. So do Next.js projects: `vinext init` refuses projects that
 * still have a Wrangler configuration.
 *
 * @param frameworkId The id of the framework
 * @returns Whether a Wrangler project gets its framework set up for cf
 */
export function requiresFrameworkSetup(frameworkId: string): boolean {
	const frameworkInfo = getAllFrameworksInfos("cf").find(
		({ id }) => id === frameworkId
	);
	return (
		frameworkInfo?.supported === true &&
		frameworkInfo.supportsCf &&
		frameworkInfo.id !== staticFramework.id &&
		frameworkInfo.id !== "next"
	);
}

/**
 * Validates that a framework supports the requested autoconfig target.
 *
 * @param framework - The detected framework.
 * @param target - The requested autoconfig target.
 * @throws {AutoConfigFrameworkConfigurationError} If a Wrangler-only framework is targeted by `cf`.
 */
export function validateFrameworkTargetSupport(
	framework: Framework,
	target: AutoConfigTarget
): void {
	if (target !== "cf") {
		return;
	}

	const frameworkInfo = getAllFrameworksInfos(target).find(
		({ id }) => id === framework.id
	);
	if (frameworkInfo?.supported !== true || frameworkInfo.supportsCf) {
		return;
	}

	throw new AutoConfigFrameworkConfigurationError(
		`cf does not support ${framework.name} projects yet. You can still use Wrangler to develop and deploy this project.`,
		{ telemetryMessage: "autoconfig framework unsupported for cf" }
	);
}

export type FrameworkInfo = {
	id: string;
	name: string;
} & (
	| { supported: false }
	| {
			supported: true;
			supportsCf: boolean;
			class: typeof Framework;
			frameworkPackageInfo: AutoConfigFrameworkPackageInfo;
	  }
);

/**
 * AutoConfig information for a package that defines a framework.
 */
export type AutoConfigFrameworkPackageInfo = {
	/** The package name (e.g. "astro" for the Astro framework and "@solidjs/start" for the SolidStart framework) */
	name: string;
	/** The minimum version (if any) of the package/framework that autoconfig supports */
	minimumVersion: string;
	/** The latest major version of the package/framework that autoconfig supports  */
	maximumKnownMajorVersion: string;
};
