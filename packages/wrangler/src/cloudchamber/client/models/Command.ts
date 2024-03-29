/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ExecFormParam } from "./ExecFormParam";

/**
 * The command to be executed when the container starts, passed to the entrypoint.
 * This can be overridden at run-time. If only the command is overridden at run-time,
 * it gets passed to the default entrypoint specified in the image.
 *
 */
export type Command = Array<ExecFormParam>;
