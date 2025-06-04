// Node.js built-in modules provided by `workerd`
export const workerdBuiltinModules = new Set([
	...VITEST_POOL_WORKERS_DEFINE_BUILTIN_MODULES,
	"__STATIC_CONTENT_MANIFEST",
]);
