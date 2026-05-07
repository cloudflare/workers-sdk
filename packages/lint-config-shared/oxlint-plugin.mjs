import noDirectRecursiveRm from "./rules/no-direct-recursive-rm.mjs";
import noUnsafeCommandExecution from "./rules/no-unsafe-command-execution.mjs";
import noWranglerNamedImports from "./rules/no-wrangler-named-imports.mjs";
import requireDescriptionWhenDisabling from "./rules/require-description-when-disabling.mjs";

export default {
	rules: {
		"no-direct-recursive-rm": noDirectRecursiveRm,
		"no-unsafe-command-execution": noUnsafeCommandExecution,
		"no-wrangler-named-imports": noWranglerNamedImports,
		"require-description-when-disabling": requireDescriptionWhenDisabling,
	},
};
