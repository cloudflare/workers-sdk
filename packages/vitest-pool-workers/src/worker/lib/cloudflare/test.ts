export let env: Record<string, unknown>;
export function _setEnv(newEnv: Record<string, unknown>) {
	env = newEnv;
}
