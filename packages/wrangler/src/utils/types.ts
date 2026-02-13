/** Makes a subset of properties in a type optional
 *
 * @example
 * 	- type A = { s: string, b: boolean, n: number }
 *  - Optional<A, 'b'|'n'> = { s: string, b?: boolean, n?: number }
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Pick<Partial<T>, K>;
