import { processArgument } from "@cloudflare/cli/args";
import { AssignIPv4, AssignIPv6 } from "@cloudflare/containers-shared";
import type { NetworkParameters } from "@cloudflare/containers-shared";

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
	return ipv4 === true
		? { assign_ipv4: AssignIPv4.PREDEFINED }
		: { assign_ipv6: AssignIPv6.PREDEFINED };
}
