import { EventEmitter } from "events";
import { render as inkRender } from "ink";
import type { ReactElement } from "react";
import type { WriteStream } from "tty";

export function renderToString(tree: ReactElement): string {
	const { output, cleanup } = render(tree);
	cleanup();
	return output;
}

// The code below is mostly copied from ink-render-string.
// See https://github.com/zhanwang626/ink-render-string.git.

// MIT License

// Copyright (c) 2021 Zhan Wang

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

interface Instance {
	output: string;
	unmount: () => void;
	cleanup: () => void;
	stdout: OutputStream;
	stderr: OutputStream;
	frames: string[];
}

const LASTFRAME_UNDEFINED = "value of stdout.lastframe() is undefined";

export class OutputStream extends EventEmitter {
	readonly frames: string[] = [];
	private _lastFrame?: string;

	get columns(): number {
		return this._originalStream.columns;
	}
	get rows(): number {
		return this._originalStream.rows;
	}

	constructor(private _originalStream: WriteStream) {
		super();
	}

	write = (frame: string) => {
		this.frames.push(frame);
		this._lastFrame = frame;
	};

	lastFrame = () => {
		return this._lastFrame;
	};
}

export const render = (tree: ReactElement): Instance => {
	const stdout = new OutputStream(process.stdout);
	const stderr = new OutputStream(process.stderr);

	const instance = inkRender(tree, {
		stdout: stdout as unknown as WriteStream,
		stderr: stderr as unknown as WriteStream,
		debug: true,
		exitOnCtrlC: false,
		patchConsole: false,
	});

	return {
		output: stdout.lastFrame() ?? LASTFRAME_UNDEFINED,
		stdout,
		stderr,
		cleanup: instance.cleanup,
		unmount: instance.unmount,
		frames: stdout.frames,
	};
};
