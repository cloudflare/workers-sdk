/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Duration string. From Go documentation:
 * A string representing the duration in the form "3d1h3m". Leading zero units are omitted.
 * As a special case, durations less than one second format use a smaller unit (milli-, micro-, or nanoseconds)
 * to ensure that the leading digit is non-zero.
 *
 */
export type Duration = string;
