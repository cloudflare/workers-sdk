// partial implementation of node:timers
// missing functions are setImmediate, active, enroll, unenroll,
// and the timers.promises object
export const setTimeout = globalThis.setTimeout.bind(globalThis);
export const clearTimeout = globalThis.clearTimeout.bind(globalThis);
export const setInterval = globalThis.setInterval.bind(globalThis);
export const clearInterval = globalThis.clearInterval.bind(globalThis);
const _default = { setTimeout, clearTimeout, setInterval, clearInterval };
export default _default;