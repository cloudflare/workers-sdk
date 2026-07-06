import dedent from "ts-dedent";
import { CLIError } from "../cli-error";

/**
 * Thrown when the user provides a custom `--env-interface` value but the
 * Worker uses the Service Worker syntax, which does not support named
 * environment interfaces.
 */
export class IncompatibleServiceWorkerError extends CLIError {
	constructor() {
		const humanMessage =
			"An env-interface value has been provided but the worker uses the incompatible Service Worker syntax";

		const aiMessage = dedent`
			Error: Incompatible Service Worker Syntax

			A custom --env-interface was specified, but the Worker uses Service Worker syntax. The --env-interface option generates a named TypeScript interface for the Worker's environment bindings. This only works with the ES Modules (module) Worker format, where bindings are passed as the "env" parameter to the "fetch" handler. Service Worker syntax accesses bindings as global variables and does not use an environment interface.

			To resolve this, either remove the --env-interface flag, or migrate the Worker to ES Modules syntax by changing addEventListener('fetch', ...) to export default { fetch(request, env, ctx) { ... } }. See https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/ for migration guidance.

			You may want to ask the human developer whether the Worker should be migrated to ES Modules or whether the --env-interface flag should be removed.
		`;

		super(humanMessage, aiMessage, {
			telemetryMessage: "type generation command env interface incompatible",
		});
	}
}
