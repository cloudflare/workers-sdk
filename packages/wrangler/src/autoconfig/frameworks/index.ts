import assert from "node:assert";
import { allFrameworksInfos, staticFramework } from "./all-frameworks";
import type { Framework } from "./framework-class";

export type { Framework, PackageJsonScriptsOverrides } from "./framework-class";

/** Set of the ids of all the possible frameworks, including the "static" framework */
const allKnownFrameworksIds = new Set<string>(
	allFrameworksInfos.map(({ id }) => id)
);

/**
 * Identifies whether a given id maps to a known framework's id
 *
 * @param frameworkId The target id to check
 * @returns true if the id is that of a known framework, false otherwise
 */
export function isKnownFramework(frameworkId: string): boolean {
	return allKnownFrameworksIds.has(frameworkId);
}

/**
 * Gets the class for a framework based on its id
 *
 * @param frameworkId The target framework's id
 * @returns The class for the framework, defaulting to the static framework is the id is not recognized
 */
export function getFrameworkClass(frameworkId: FrameworkInfo["id"]): Framework {
	const targetedFramework = allFrameworksInfos.find(
		(framework) => framework.id === frameworkId
	);
	const framework = targetedFramework ?? staticFramework;
	return new framework.class({ id: framework.id, name: framework.name });
}

/**
 * Checks whether a framework is supported by autoconfig.
 *
 * @param frameworkId The target framework's id
 * @returns a boolean indicating wether the framework is supported
 */
export function isFrameworkSupported(
	frameworkId: FrameworkInfo["id"]
): boolean {
	const targetedFramework = allFrameworksInfos.find(
		(framework) => framework.id === frameworkId
	);
	assert(
		targetedFramework,
		`Unexpected unknown framework id: ${JSON.stringify(frameworkId)}`
	);
	return targetedFramework.supported;
}

export type FrameworkInfo = {
	id: string;
	name: string;
	class: typeof Framework;
} & (
	| { supported: false }
	| {
			supported: true;
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
