/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Represents a port assignment for a deployment
 */
export type Port = {
	/**
	 * The name of the port. The port name should be unique for each deployment and be between 1 and 15 characters long. Only alphanumeric characters, dashes (-), and underscores (_) are allowed. No consecutive dashes. The value of the port is exposed to the user's application with a set of environment variables, where `<name>` below is the name of the port with dashes converted to underscores (example: "web-ui" becomes "web_ui"):
	 * - `CLOUDFLARE_PORT_<name>`: Port inside the container
	 * - `CLOUDFLARE_HOST_PORT_<name>`: Port outside the container
	 * - `CLOUDFLARE_HOST_IP_<name>`: Address of the external network interface the port is allocated on
	 * - `CLOUDFLARE_HOST_ADDR_<name>`: `CLOUDFLARE_HOST_IP_<name>:CLOUDFLARE_HOST_PORT_<name>`
	 *
	 */
	name: string;
	/**
	 * Optional port number, it's assigned only if the user specified it. If it's not specified, the datacenter scheduler will decide it.
	 */
	port?: number;
};
