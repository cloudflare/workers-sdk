import { getEnvironmentVariableFactory } from "../environment-variables/factory";

export const getHyperdriveWarningFromEnv = getEnvironmentVariableFactory({
	variableName: "NO_HYPERDRIVE_WARNING",
});

export const hyperdriveBetaWarning =
	"--------------------\n📣 Hyperdrive is currently in open beta\n📣 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose\n📣 To give feedback, visit https://discord.gg/cloudflaredev\n--------------------\n";
