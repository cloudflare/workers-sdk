/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type BadRequestWithCodeError = {
	/**
	 * If VALIDATE_INPUT, you should see the inputs that were wrong in the details object.
	 */
	error: BadRequestWithCodeError.error;
	/**
	 * Details that might be filled depending on the error code.
	 */
	details?: Record<string, any>;
};

export namespace BadRequestWithCodeError {
	/**
	 * If VALIDATE_INPUT, you should see the inputs that were wrong in the details object.
	 */
	export enum error {
		VALIDATE_INPUT = "VALIDATE_INPUT",
	}
}
