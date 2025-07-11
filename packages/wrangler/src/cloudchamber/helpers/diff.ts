// Code from package jsdiff (https://github.com/kpdecker/jsdiff/tree/master)
// It's been simplified so it can basically do line diffing only
// and we can avoid the 600kb sized package.
import { log } from "@cloudflare/cli";
import { bold, brandColor, red } from "@cloudflare/cli/colors";

class Diff {
	diff(oldString: string[], newString: string[], callback: Callback) {
		function done(value: Result[]) {
			callback(value);
			return true;
		}

		const newLen = newString.length,
			oldLen = oldString.length;
		let editLength = 1;
		const bestPath: (BestPath | undefined)[] = [
			{ oldPos: -1, lastComponent: undefined },
		];

		if (bestPath[0] === undefined) {
			throw new Error("unreachable");
		}

		// Seed editLength = 0, i.e. the content starts with the same values
		let newPos = this.extractCommon(bestPath[0], newString, oldString, 0);
		if (bestPath[0].oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
			// Identity per the equality and tokenizer
			return done(
				buildValues(
					this,
					bestPath[0].lastComponent,
					newString,
					oldString,
					false
				)
			);
		}

		// Once we hit the right edge of the edit graph on some diagonal k, we can
		// definitely reach the end of the edit graph in no more than k edits, so
		// there's no point in considering any moves to diagonal k+1 any more (from
		// which we're guaranteed to need at least k+1 more edits).
		// Similarly, once we've reached the bottom of the edit graph, there's no
		// point considering moves to lower diagonals.
		// We record this fact by setting minDiagonalToConsider and
		// maxDiagonalToConsider to some finite value once we've hit the edge of
		// the edit graph.
		// This optimization is not faithful to the original algorithm presented in
		// Myers's paper, which instead pointlessly extends D-paths off the end of
		// the edit graph - see page 7 of Myers's paper which notes this point
		// explicitly and illustrates it with a diagram. This has major performance
		// implications for some common scenarios. For instance, to compute a diff
		// where the new text simply appends d characters on the end of the
		// original text of length n, the true Myers algorithm will take O(n+d^2)
		// time while this optimization needs only O(n+d) time.
		let minDiagonalToConsider = -Infinity,
			maxDiagonalToConsider = Infinity;

		// Main method. checks all permutations of a given edit length for acceptance.
		const execEditLength = () => {
			for (
				let diagonalPath = Math.max(minDiagonalToConsider, -editLength);
				diagonalPath <= Math.min(maxDiagonalToConsider, editLength);
				diagonalPath += 2
			) {
				let basePath: BestPath;
				const removePath = bestPath[diagonalPath - 1],
					addPath = bestPath[diagonalPath + 1];
				if (removePath) {
					// No one else is going to attempt to use this value, clear it
					bestPath[diagonalPath - 1] = undefined;
				}

				let canAdd = false;
				if (addPath) {
					// what newPos will be after we do an insertion:
					const addPathNewPos = addPath.oldPos - diagonalPath;
					canAdd = addPath && 0 <= addPathNewPos && addPathNewPos < newLen;
				}

				const canRemove = removePath && removePath.oldPos + 1 < oldLen;
				if (!canAdd && !canRemove) {
					// If this path is a terminal then prune
					bestPath[diagonalPath] = undefined;
					continue;
				}

				// Select the diagonal that we want to branch from. We select the prior
				// path whose position in the old string is the farthest from the origin
				// and does not pass the bounds of the diff graph
				if (
					addPath &&
					(!canRemove ||
						(canAdd && (removePath?.oldPos ?? 0) < (addPath?.oldPos ?? 0)))
				) {
					basePath = this.addToPath(addPath, true, false, 0);
				} else if (removePath) {
					basePath = this.addToPath(removePath, false, true, 1);
				} else {
					throw new Error("unreachable");
				}

				newPos = this.extractCommon(
					basePath,
					newString,
					oldString,
					diagonalPath
				);

				if (basePath.oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
					// If we have hit the end of both strings, then we are done
					return done(
						buildValues(
							this,
							basePath.lastComponent,
							newString,
							oldString,
							false
						)
					);
				} else {
					bestPath[diagonalPath] = basePath;
					if (basePath.oldPos + 1 >= oldLen) {
						maxDiagonalToConsider = Math.min(
							maxDiagonalToConsider,
							diagonalPath - 1
						);
					}
					if (newPos + 1 >= newLen) {
						minDiagonalToConsider = Math.max(
							minDiagonalToConsider,
							diagonalPath + 1
						);
					}
				}
			}

			editLength++;
		};

		while (!execEditLength()) {}
	}

	addToPath(
		path: BestPath,
		added: boolean,
		removed: boolean,
		oldPosInc: number
	): BestPath {
		const last = path.lastComponent;
		if (last && last.added === added && last.removed === removed) {
			return {
				oldPos: path.oldPos + oldPosInc,
				lastComponent: {
					count: last.count + 1,
					added: added,
					removed: removed,
					previousComponent: last.previousComponent,
				},
			};
		}

		return {
			oldPos: path.oldPos + oldPosInc,
			lastComponent: {
				count: 1,
				added: added,
				removed: removed,
				previousComponent: last,
			},
		};
	}

	extractCommon(
		basePath: BestPath,
		newString: string[],
		oldString: string[],
		diagonalPath: number
	) {
		const newLen = newString.length;
		const oldLen = oldString.length;
		let oldPos = basePath.oldPos,
			newPos = oldPos - diagonalPath,
			commonCount = 0;
		while (
			newPos + 1 < newLen &&
			oldPos + 1 < oldLen &&
			oldString[oldPos + 1] === newString[newPos + 1]
		) {
			newPos++;
			oldPos++;
			commonCount++;
		}

		if (commonCount) {
			basePath.lastComponent = {
				count: commonCount,
				previousComponent: basePath.lastComponent,
				added: false,
				removed: false,
			};
		}

		basePath.oldPos = oldPos;
		return newPos;
	}

	equals(left: string, right: string) {
		return left === right;
	}

	join(chars: string[]) {
		return chars.join("");
	}
}

function buildValues(
	diff: Diff,
	lastComponent: Result | undefined,
	newString: string[],
	oldString: string[],
	useLongestToken: boolean
): Result[] {
	// First we convert our linked list of components in reverse order to an
	// array in the right order:
	const components = [];
	let nextComponent;
	while (lastComponent) {
		components.push(lastComponent);
		nextComponent = lastComponent.previousComponent;
		delete lastComponent.previousComponent;
		lastComponent = nextComponent;
	}
	components.reverse();

	const componentLen = components.length;
	let componentPos = 0,
		newPos = 0,
		oldPos = 0;

	for (; componentPos < componentLen; componentPos++) {
		const component = components[componentPos];
		if (!component.removed) {
			if (!component.added && useLongestToken) {
				let value = newString.slice(newPos, newPos + component.count);
				value = value.map((el, i) => {
					const oldValue = oldString[oldPos + i];
					return oldValue.length > el.length ? oldValue : el;
				});

				component.value = diff.join(value);
			} else {
				component.value = diff.join(
					newString.slice(newPos, newPos + component.count)
				);
			}
			newPos += component.count;

			// Common case
			if (!component.added) {
				oldPos += component.count;
			}
		} else {
			component.value = diff.join(
				oldString.slice(oldPos, oldPos + component.count)
			);
			oldPos += component.count;
		}
	}

	return components;
}

export const lineDiff = new Diff();

export type Result = {
	count: number;
	added: boolean;
	removed: boolean;
	value?: string;
	previousComponent?: Result;
};

type BestPath = {
	oldPos: number;
	lastComponent?: Result;
};

type Callback = (result: Result[]) => void;

function tokenize(value: string) {
	const retLines = [],
		linesAndNewlines = value.split(/(\n|\r\n)/);

	// Ignore the final empty token that occurs if the string ends with a new line
	if (!linesAndNewlines[linesAndNewlines.length - 1]) {
		linesAndNewlines.pop();
	}

	// Merge the content and line separators into single tokens
	for (let i = 0; i < linesAndNewlines.length; i++) {
		const line = linesAndNewlines[i];
		retLines.push(line);
	}

	return retLines.filter((s) => s !== "");
}

export function diffLines(oldStr: string, newStr: string): Result[] {
	let res: Result[] = [];
	lineDiff.diff(tokenize(oldStr), tokenize(newStr), (r) => {
		res = r;
	});

	return res;
}

// **************************************************
// Below lie other helpers related to printing diffs
// **************************************************

function isNumber(c: string | number) {
	if (typeof c === "number") {
		return true;
	}
	const code = c.charCodeAt(0);
	const zero = "0".charCodeAt(0);
	const nine = "9".charCodeAt(0);
	return code >= zero && code <= nine;
}

/**
 * createLine takes a string and goes through each character, rendering possibly syntax highlighting.
 * Useful to render TOML files.
 */
export function createLine(el: string, startWith = ""): string {
	let line = startWith;
	let lastAdded = 0;
	const addToLine = (i: number, color = (s: string) => s) => {
		line += color(el.slice(lastAdded, i));
		lastAdded = i;
	};

	const state = {
		render: "left" as "quotes" | "number" | "left" | "right" | "section",
	};
	for (let i = 0; i < el.length; i++) {
		const current = el[i];
		const peek = i + 1 < el.length ? el[i + 1] : null;
		const prev = i === 0 ? null : el[i - 1];

		switch (state.render) {
			case "left":
				if (current === "=") {
					state.render = "right";
				}

				break;
			case "right":
				if (current === '"') {
					addToLine(i);
					state.render = "quotes";
					break;
				}

				if (isNumber(current)) {
					addToLine(i);
					state.render = "number";
					break;
				}

				if (current === "[" && peek === "[") {
					state.render = "section";
				}

				break;
			case "quotes":
				if (current === '"') {
					addToLine(i + 1, brandColor);
					state.render = "right";
				}

				break;
			case "number":
				if (!isNumber(el)) {
					addToLine(i, red);
					state.render = "right";
				}

				break;
			case "section":
				if (current === "]" && prev === "]") {
					addToLine(i + 1);
					state.render = "right";
				}
		}
	}

	switch (state.render) {
		case "left":
			addToLine(el.length);
			break;
		case "right":
			addToLine(el.length);
			break;
		case "quotes":
			addToLine(el.length, brandColor);
			break;
		case "number":
			addToLine(el.length, red);
			break;
		case "section":
			// might be unreachable
			addToLine(el.length, bold);
			break;
	}

	return line;
}

/**
 * printLine takes a line and prints it by using createLine and use printFunc
 */
export function printLine(el: string, startWith = "", printFunc = log) {
	printFunc(createLine(el, startWith));
}

/**
 * Removes from the object every undefined property
 */
export function stripUndefined<T = Record<string, unknown>>(r: T): T {
	for (const k in r) {
		if (r[k] === undefined) {
			delete r[k];
		}
	}

	return r;
}

/**
 * Take an object and sort its keys in alphabetical order.
 */
function sortObjectKeys(unordered: Record<string | number, unknown>) {
	if (Array.isArray(unordered)) {
		return unordered;
	}

	return Object.keys(unordered)
		.sort()
		.reduce(
			(obj, key) => {
				obj[key] = unordered[key];
				return obj;
			},
			{} as Record<string, unknown>
		);
}

/**
 * Take an object and sort its keys in alphabetical order recursively.
 * Useful to normalize objects so they can be compared when rendered.
 * It will copy the object and not mutate it.
 */
export function sortObjectRecursive<T = Record<string | number, unknown>>(
	object: Record<string | number, unknown> | Record<string | number, unknown>[]
): T {
	if (typeof object !== "object") {
		return object;
	}

	if (Array.isArray(object)) {
		return object.map((obj) => sortObjectRecursive(obj)) as T;
	}

	const objectCopy: Record<string | number, unknown> = { ...object };
	for (const [key, value] of Object.entries(object)) {
		if (typeof value === "object") {
			if (value === null) {
				continue;
			}
			objectCopy[key] = sortObjectRecursive(
				value as Record<string, unknown>
			) as unknown;
		}
	}

	return sortObjectKeys(objectCopy) as T;
}
