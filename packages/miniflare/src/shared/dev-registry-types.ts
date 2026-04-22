export type WorkerRegistry = Record<string, WorkerDefinition>;

export type WorkerDefinition = {
	/**
	 * Address of the workerd debug port for this worker's process (e.g. "127.0.0.1:12345").
	 * The debug port provides native Cap'n Proto RPC access to all services/entrypoints.
	 */
	debugPortAddress: string;
	/**
	 * The workerd service name for the default entrypoint. This varies by worker type:
	 * - Workers with assets: routes through the assets RPC proxy
	 * - Vite workers: routes through the vite proxy worker
	 * - Plain workers: routes directly to the user worker service
	 */
	defaultEntrypointService: string;
	/**
	 * The workerd service name for the user worker directly
	 * For plain workers this is identical to defaultEntrypointService, but for other
	 * workers it bypasses the Assets proxy (whether built-in or userland)
	 */
	userWorkerService: string;
};
