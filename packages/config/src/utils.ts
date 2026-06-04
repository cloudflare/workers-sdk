/**
 * Represents any valid JSON value.
 */
export type Json =
	| string
	| number
	| boolean
	| null
	| Json[]
	| { [key: string]: Json };
