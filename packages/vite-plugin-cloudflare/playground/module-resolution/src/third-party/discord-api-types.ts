import { RPCErrorCodes, Utils } from "discord-api-types/v10";

// resolving discord-api-types/v10 (package which uses `require()`s without extensions
// can be problematic, see: https://github.com/dario-piotrowicz/vitest-pool-workers-ext-repro)
export default {
	"(discord-api-types/v10) Utils.isLinkButton({})": Utils.isLinkButton(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		{} as any
	),
	"(discord-api-types/v10) RPCErrorCodes.InvalidUser":
		RPCErrorCodes.InvalidUser,
};
