// Stub polyfill for node:v8 — workerd doesn't natively support this module.
// Vitest 4.1.0-beta.4 imports node:v8 to check `v8.startupSnapshot.isBuildingSnapshot()`
// which should always return false in workerd.

export const startupSnapshot = {
	isBuildingSnapshot() {
		return false;
	},
};

export default { startupSnapshot };
