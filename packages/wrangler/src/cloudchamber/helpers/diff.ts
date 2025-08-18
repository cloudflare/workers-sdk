// Modified code from package jsdiff (https://github.com/kpdecker/jsdiff/tree/master)
// It's been simplified so it can basically do line diffing only
// and we can avoid the 600kb sized package.
//
// Original license below:
//
// BSD 3-Clause License
//
// Copyright (c) 2009-2015, Kevin Decker <kpdecker@gmail.com>
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this
//    list of conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
//
// 3. Neither the name of the copyright holder nor the names of its
//    contributors may be used to endorse or promote products derived from
//    this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
// FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
// DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
// SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
// CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
// OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

import { log } from "@cloudflare/cli";
import { green, red } from "@cloudflare/cli/colors";

type Result = {
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

// TODO: move this Diff Class to a shared location (since it is not Cloudchamber specific)
export class Diff {
	#results: Result[] = [];

	get changes(): number {
		return this.#results.filter((r) => r.added || r.removed).length;
	}

	constructor(a: string, b: string) {
		const oldString = tokenize(a);
		const newString = tokenize(b);
		const newLen = newString.length;
		const oldLen = oldString.length;
		let editLength = 1;
		const bestPath: (BestPath | undefined)[] = [
			{ oldPos: -1, lastComponent: undefined },
		];

		if (bestPath[0] === undefined) {
			throw new Error("unreachable");
		}

		// Seed editLength = 0, i.e. the content starts with the same values
		let newPos = this.#extractCommon(bestPath[0], newString, oldString, 0);
		if (bestPath[0].oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
			// Identity per the equality and tokenizer
			this.#results = this.#buildValues(
				bestPath[0].lastComponent,
				newString,
				oldString,
				false
			);

			return;
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
		let minDiagonalToConsider = -Infinity;
		let maxDiagonalToConsider = Infinity;

		// Main method. checks all permutations of a given edit length for acceptance.
		let done = false;
		while (!done) {
			for (
				let diagonalPath = Math.max(minDiagonalToConsider, -editLength);
				diagonalPath <= Math.min(maxDiagonalToConsider, editLength);
				diagonalPath += 2
			) {
				let basePath: BestPath;
				const removePath = bestPath[diagonalPath - 1];
				const addPath = bestPath[diagonalPath + 1];
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
					basePath = this.#addToPath(addPath, true, false, 0);
				} else if (removePath) {
					basePath = this.#addToPath(removePath, false, true, 1);
				} else {
					throw new Error("unreachable");
				}

				newPos = this.#extractCommon(
					basePath,
					newString,
					oldString,
					diagonalPath
				);

				if (basePath.oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
					// If we have hit the end of both strings, then we are done
					this.#results = this.#buildValues(
						basePath.lastComponent,
						newString,
						oldString,
						false
					);

					done = true;

					break;
				}

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

			editLength++;
		}
	}

	/**
	 * Results but refined to be printed/stringified.
	 *
	 * In particular the results returned here are ordered to try to avoid cases
	 * in which an addition/removal is incorrectly split.
	 *
	 * For example, the standard results can produce something like:
	 * ```
	 *  ...
	 * - "vars": {
	 * + "vars": {},
	 * -   "MY_VAR": "variable set in the dash"
	 * - },
	 *  ...
	 * ```
	 * (notice how the first removal is separated from the last two,
	 * making the diff much less readable).
	 * Such change in the refined results will instead look like:
	 * ```
	 *  ...
	 * + "vars": {},
	 * - "vars": {
	 * -   "MY_VAR": "variable set in the dash"
	 * - },
	 *  ...
	 * ```
	 */
	get #resultsForPrint() {
		const results = [
			...this.#results.filter((r) => !!r.value && r.value !== "\n"),
		];

		const swapLines = (i: number, j: number) => {
			const tmp = results[i];
			results[i] = results[j];
			results[j] = tmp;
		};

		const numOfLines = (str: string) => str.split("\n").length;

		const isLoneResult = (index: number, target: -1 | 1): boolean => {
			const currentIdx = index;
			const adjacentIdx = currentIdx + target;
			const nextIdx = currentIdx + target + target;

			// If any of the results we need to analize is not present we return false
			if (!results[adjacentIdx] || !results[nextIdx] || !results[nextIdx]) {
				return false;
			}

			const previousIdx = index - target;

			const isAlternation = (type: "added" | "removed") =>
				results[currentIdx][type] === true &&
				results[previousIdx]?.[type] !== results[currentIdx][type] &&
				results[adjacentIdx][type === "added" ? "removed" : "added"] === true &&
				results[nextIdx][type] === true;

			// If there isn't an alternation between added and removed results then we return false
			if (!isAlternation("added") && !isAlternation("removed")) {
				return false;
			}

			// We might have found a lone result but to make sure we need to check that the next index
			// contains multiple lines while the current and adjacent ones both only contain one
			return (
				numOfLines(results[currentIdx].value ?? "") === 1 &&
				numOfLines(results[adjacentIdx].value ?? "") === 1 &&
				numOfLines(results[nextIdx].value ?? "") > 1
			);
		};

		for (let i = 0; i < results.length; i++) {
			if (isLoneResult(i, +1)) {
				swapLines(i, i + 1);
				continue;
			}

			if (isLoneResult(i, -1)) {
				swapLines(i, i - 1);
				continue;
			}
		}

		return results;
	}

	toString(
		options: {
			// Number of lines of context to print before and after each diff segment
			contextLines: number;
		} = {
			contextLines: 3,
		}
	) {
		let output = "";
		let state: "init" | "diff" = "init";
		const context: string[] = [];

		for (const result of this.#resultsForPrint) {
			if (result.value === undefined) {
				continue;
			}

			if (result.added || result.removed) {
				if (state === "diff") {
					// Print the context after the last diff, if any
					context
						.splice(0, options.contextLines)
						.filter(Boolean)
						.forEach((c) => {
							output += `  ${c}\n`;
						});

					// Indicate gaps between context chunks
					if (context.length > options.contextLines) {
						output += "\n  ...\n\n";
					}
				}

				// Remove everything except the most recent context chunk
				context.splice(0, context.length - options.contextLines);

				// If we haven't printed anything yet then omit leading empty lines
				if (state === "init") {
					while (context.length > 0 && context[0].trim() === "") {
						context.shift();
					}
				}

				context.filter(Boolean).forEach((c) => {
					output += `  ${c}\n`;
				});
				context.length = 0;

				for (const l of result.value.split("\n")) {
					if (l) {
						output += `${result.added ? green("+") : red("-")} ${l}\n`;
					}
				}

				state = "diff";
			} else {
				// Remove trailing and leading newlines from the context
				// chunk since we add newlines ourselves when we print
				const lines = result.value.replace(/^\n|\n$/g, "").split("\n");
				context.push(...lines);
			}
		}

		if (state === "diff") {
			// Trim trailing whitespace from the final context chunk
			context.splice(options.contextLines);
			while (context.length > 0 && context[context.length - 1].trim() === "") {
				context.pop();
			}

			context.filter(Boolean).forEach((c) => {
				output += `  ${c}\n`;
			});
		}

		return output.replace(/\n$/, "");
	}

	print(
		options: {
			// Number of lines of context to print before and after each diff segment
			contextLines: number;
		} = {
			contextLines: 3,
		}
	) {
		log(this.toString(options));
	}

	#addToPath(
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

	#extractCommon(
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

	#buildValues(
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

					component.value = value.join("");
				} else {
					component.value = newString
						.slice(newPos, newPos + component.count)
						.join("");
				}
				newPos += component.count;

				// Common case
				if (!component.added) {
					oldPos += component.count;
				}
			} else {
				component.value = oldString
					.slice(oldPos, oldPos + component.count)
					.join("");
				oldPos += component.count;
			}
		}

		return components;
	}
}

function tokenize(value: string) {
	const retLines = [];
	const linesAndNewlines = value.split(/(\n|\r\n)/);

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
