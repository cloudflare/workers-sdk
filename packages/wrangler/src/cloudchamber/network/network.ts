import { processArgument } from "@cloudflare/cli/args";
import { AssignIPv4 } from "../client";
import type { NetworkParameters } from "../client";

export async function getNetworkInput(args: {
	ipv4?: boolean;
}): Promise<NetworkParameters | undefined> {
	const ipv4 = await processArgument<boolean>(args, "ipv4", {
		question: "Add an IPv4 to the deployment?",
		helpText:
			"Your deployment will have IPv4 network connectivity if you select yes. Your deployment will always have an IPv6",
		label: "Include IPv4",
		type: "confirm",
	});
	return ipv4 === true ? { assign_ipv4: AssignIPv4.PREDEFINED } : undefined;
}
