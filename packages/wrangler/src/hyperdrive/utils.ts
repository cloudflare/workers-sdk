import { getEnvironmentVariableFactory } from "../environment-variables/factory";

export const getHyperdriveLocalConnectionStringFromEnv = (
	bindingName: string
) =>
	getEnvironmentVariableFactory({
		variableName: `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_${bindingName}`,
	})();

export const getHyperdriveWarningFromEnv = getEnvironmentVariableFactory({
	variableName: "NO_HYPERDRIVE_WARNING",
});

export const hyperdriveBetaWarning = process.env.NO_HYPERDRIVE_WARNING
	? ""
	: "--------------------\n📣 Hyperdrive is currently in open beta\n📣 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose\n📣 To give feedback, visit https://discord.gg/cloudflaredev\n--------------------\n";
