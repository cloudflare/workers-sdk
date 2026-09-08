/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ExecFormParam } from "./ExecFormParam";

/**
 * The entry point for the container, specifying the executable to run when the container starts.
 * This can be overridden at run-time. If overridden, the default command from the image is ignored.
 * Both entrypoint and command can be specified at run-time to completely replace the image defaults.
 *
 */
export type Entrypoint = Array<ExecFormParam>;
