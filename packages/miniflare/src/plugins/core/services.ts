// Service binding designator that always points to the worker with the binding.
// Using `Symbol.for()` instead of `Symbol()` in case multiple copies of
// `miniflare` are loaded (e.g. when configuring Vitest and when running pool)
export const kCurrentWorker = Symbol.for("miniflare.kCurrentWorker");
