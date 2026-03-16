import noDirectRecursiveRm from "./rules/no-direct-recursive-rm.mjs";
import noUnsafeCommandExecution from "./rules/no-unsafe-command-execution.mjs";
import noVitestImportExpect from "./rules/no-vitest-import-expect.mjs";

export default {
	rules: {
		"no-direct-recursive-rm": noDirectRecursiveRm,
		"no-unsafe-command-execution": noUnsafeCommandExecution,
		"no-vitest-import-expect": noVitestImportExpect,
	},
};
