import { C3_DEFAULTS } from "helpers/cli";
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
	};
};
