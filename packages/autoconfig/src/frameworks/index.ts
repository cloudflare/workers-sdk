import assert from "node:assert";
import { FatalError } from "@cloudflare/workers-utils";
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
 * Explains why autoconfig can't set up a framework for the requested target, if it can't.
 *
 * @param framework - The detected framework.
 * @param target - The requested autoconfig target.
 * @returns The error to report, or `undefined` when autoconfig can set up the framework.
 */
export function getFrameworkSupportError(
	framework: Framework,
	target: AutoConfigTarget
): Error | undefined {
	const frameworkInfo = getAllFrameworksInfos(target).find(
		({ id }) => id === framework.id
	);
	if (frameworkInfo === undefined) {
		return undefined;
	}
	if (!frameworkInfo.supported) {
		return new FatalError(
			framework.id === "cloudflare-pages"
				? `The target project seems to be using Cloudflare Pages. Automatically migrating from a Pages project to Workers is not yet supported.`
				: `The detected framework ("${framework.name}") cannot be automatically configured.`,
			{ telemetryMessage: "autoconfig run framework unsupported" }
		);
	}
	if (target === "cf" && !frameworkInfo.supportsCf) {
		return new AutoConfigFrameworkConfigurationError(
			`cf does not support ${framework.name} projects yet. You can still use Wrangler to develop and deploy this project.`,
			{ telemetryMessage: "autoconfig framework unsupported for cf" }
		);
	}
	return undefined;
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
