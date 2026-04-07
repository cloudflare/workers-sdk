/* tslint:disable */
/* eslint-disable */

export function init(): void;

/**
 * Parse a single workflow source file and return the DAG as a JSON string.
 *
 * # Arguments
 * * `source_code` - The JavaScript/TypeScript source code to parse
 *
 * # Returns
 * A JSON string containing the `ParserResult` envelope (`{"success": true, "v": 1, "workflows": [...]}`)
 * on success, or `{"success": false, "v": 1, "error": "...", "workflows": []}` on failure.
 */
export function parseDag(source_code: string): string;
