// Use `Symbol.for()` in case multiple copies of `miniflare` are loaded (e.g.
// when configuring Vitest and when running pool).
export const kCurrentWorker = Symbol.for("miniflare.kCurrentWorker");
