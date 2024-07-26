/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Command } from "./Command";
import type { Entrypoint } from "./Entrypoint";

/**
 * Create a new application Job request body
 */
export type CreateApplicationJobRequest = {
	entrypoint: Entrypoint;
	command: Command;
};
