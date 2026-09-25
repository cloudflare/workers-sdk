/**
 * Standard method decorator that rejects a non-positive first argument.
 *
 * @param method - The decorated method.
 * @param context - The decorator context, used for the error message.
 * @returns The wrapped method.
 */
export function positive<This, Return>(
	method: (this: This, n?: number) => Return,
	context: ClassMethodDecoratorContext<This>
) {
	return function (this: This, n?: number): Return {
		if (n !== undefined && n <= 0) {
			throw new RangeError(
				`${String(context.name)}() expects a positive number, got ${n}`
			);
		}
		return method.call(this, n);
	};
}
