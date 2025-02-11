import { C3_DEFAULTS } from "helpers/cli";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../templates";
import type { C3Args, C3Context } from "types";

export const createTestArgs = (args?: Partial<C3Args>) => {
	return {
		...C3_DEFAULTS,
		...args,
	};
};

export const createTestContext = (name = "test", args?: C3Args): C3Context => {
	const path = `./${name}`;
	return {
		project: { name, path },
		args: args ?? createTestArgs(),
		originalCWD: path,
		gitRepoAlreadyExisted: false,
		template: createTestTemplate(),
		deployment: {},
		packageManager: detectPackageManager(),
	};
};

export const createTestTemplate = (
	config?: Partial<TemplateConfig>,
): TemplateConfig => {
	return {
		...config,
		id: "test",
		platform: "workers",
		displayName: "Test Template",
		configVersion: 1,
		generate: Promise.resolve,
	};
};
