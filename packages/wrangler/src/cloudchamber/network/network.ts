import { processArgument } from "@cloudflare/cli-shared-helpers/args";
import { AssignIPv4, AssignIPv6 } from "@cloudflare/containers-shared";
import chalk from "chalk";
import type { NetworkParameters } from "@cloudflare/containers-shared";

export async function getNetworkInput(args: {
	ipv4?: boolean;
}): Promise<NetworkParameters | undefined> {
	const ipv4 = await processArgument<boolean>(args, "ipv4", {
		message: `Add an IPv4 to the deployment? ${chalk.dim("Your deployment will have IPv4 network connectivity if you select yes. Your deployment will always have an IPv6.")}`,
		type: "confirm",
	});
	return ipv4 === true
		? { assign_ipv4: AssignIPv4.PREDEFINED }
		: { assign_ipv6: AssignIPv6.PREDEFINED };
}
