import { convertConfigToBindings } from "@cloudflare/deploy-helpers";
import type { StartDevWorkerOptions } from "@cloudflare/remote-bindings/internal";
import type { Config, ConfigBindingFieldName } from "@cloudflare/workers-utils";

export function convertConfigBindingsToStartWorkerBindings(
	configBindings: Partial<Pick<Config, ConfigBindingFieldName>>
): StartDevWorkerOptions["bindings"] {
	return convertConfigToBindings(configBindings, {
		usePreviewIds: true,
	});
}
