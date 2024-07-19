/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Represents a port assignment for a deployment
 */
export type Port = {
	/**
	 * The name of the port. The port name should be unique for each deployment. Minimum length of 1 and maximum length of 15. No consecutive dashes. If the name is 'web-ui', the container will receive an environment variable as follows:
	 * - CLOUDFLARE_PORT_WEB_UI: Port inside the container
	 * - CLOUDFLARE_HOST_PORT_WEB_UI: Port outside the container
	 * - CLOUDFLARE_HOST_IP_WEB_UI: Address of the external network interface the port is allocated on
	 * - CLOUDFLARE_HOST_ADDR_WEB_UI: CLOUDFLARE_HOST_ADDR_WEB_UI ':' CLOUDFLARE_HOST_PORT_WEB_UI
	 *
	 */
	name: string;
	/**
	 * Optional port number, it's assigned only if the user specified it. If it's not specified, the datacenter scheduler will decide it.
	 */
	port?: number;
};
