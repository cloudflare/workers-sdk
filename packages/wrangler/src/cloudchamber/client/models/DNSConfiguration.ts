/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Domain } from "./Domain";
import type { IP } from "./IP";

/**
 * Represents the /etc/resolv.conf that will appear in the deployment.
 * If the 'dns' property is specified, even if empty object, will override the default resolv.conf of the container.
 * The default resolv.conf of a container is 'servers = ["1.1.1.1", "9.9.9.9", "2606:4700:4700::1111"]', only if an IPv4 is assigned.
 * The default for a non IPv4 deployment is 'servers = ["2606:4700:4700::1111", "2620:fe::fe"]'.
 *
 */
export type DNSConfiguration = {
	/**
	 * List of DNS servers that the deployment will use to resolve domain names. You can only specify a maximum of 3.
	 */
	servers?: Array<IP>;
	/**
	 * The container resolver will append these domains to every resolve query. For example, if you have 'google.com',
	 * and your deployment queries 'web', it will append 'google.com' to 'web' in the search query before trying 'web'.
	 * Limited to 6 domains.
	 *
	 */
	searches?: Array<Domain>;
};
