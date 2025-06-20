/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { PortRange } from "./PortRange";

/**
 * Represents a port assignment for a deployment
 */
export type Port = {
	/**
	 * A port name. The port array should not have duplicate names. The port name should be between 1 and 15 characters long. Only alphanumeric characters, dashes (-), and underscores (_) are allowed. No consecutive dashes. The value of the port is exposed to the user's application with a set of environment variables, where `<name>` below is the name of the port with dashes converted to underscores (example: "web-ui" becomes "web_ui"):
	 * - `CLOUDFLARE_PORT_<name>`: Port inside the container
	 * - `CLOUDFLARE_HOST_PORT_<name>`: Port outside the container
	 * - `CLOUDFLARE_HOST_IP_<name>`: Address of the external network interface the port is allocated on
	 * - `CLOUDFLARE_HOST_ADDR_<name>`: `CLOUDFLARE_HOST_IP_<name>:CLOUDFLARE_HOST_PORT_<name>`
	 *
	 */
	name: string;
	/**
	 * Optional port number, it's assigned only if the user specified it.
	 * If it's not specified, the datacenter scheduler will decide it.
	 *
	 */
	port?: number;
	/**
	 * Choose a port number from a given set of port ranges and use it. It is an optional field.
	 * If it is set, "port" must not be provided. The same port ranges may be used with multiple ports
	 * as long as the port ranges are identical for each port. Otherwise no two port ranges must intersect
	 * and no fixed port must belong to any port range. The total port count for all port ranges should
	 * be sufficiently large for assigning the requested number of ports.
	 *
	 */
	assign_port?: Array<PortRange>;
};
