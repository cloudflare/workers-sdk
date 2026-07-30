// Re-export saffron's WorkerEntrypoint so it can be embedded as the SAFFRON
// service. The `.wasm` import is kept external by the build (externalWasmPlugin).
export { CronFetcher } from "@cloudflare/workflows-shared/src/saffron-worker";
