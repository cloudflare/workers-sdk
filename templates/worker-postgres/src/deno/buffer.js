class DenoStdInternalError extends Error {
	constructor(message) {
		super(message);
		this.name = 'DenoStdInternalError';
	}
}
function assert(expr, msg = '') {
	if (!expr) {
		throw new DenoStdInternalError(msg);
	}
}
function copy(src, dst, off = 0) {
	off = Math.max(0, Math.min(off, dst.byteLength));
	const dstBytesAvailable = dst.byteLength - off;
	if (src.byteLength > dstBytesAvailable) {
		src = src.subarray(0, dstBytesAvailable);
	}
	dst.set(src, off);
	return src.byteLength;
}
const MIN_READ = 32 * 1024;
const MAX_SIZE = 2 ** 32 - 2;
class Buffer1 {
	#buf;
	#off = 0;
	constructor(ab) {
		this.#buf = ab === undefined ? new Uint8Array(0) : new Uint8Array(ab);
	}
	bytes(
		options = {
			copy: true,
		}
	) {
		if (options.copy === false) return this.#buf.subarray(this.#off);
		return this.#buf.slice(this.#off);
	}
	empty() {
		return this.#buf.byteLength <= this.#off;
	}
	get length() {
		return this.#buf.byteLength - this.#off;
	}
	get capacity() {
		return this.#buf.buffer.byteLength;
	}
	truncate(n) {
		if (n === 0) {
			this.reset();
			return;
		}
		if (n < 0 || n > this.length) {
			throw Error('bytes.Buffer: truncation out of range');
		}
		this.#reslice(this.#off + n);
	}
	reset() {
		this.#reslice(0);
		this.#off = 0;
	}
	#tryGrowByReslice(n) {
		const l = this.#buf.byteLength;
		if (n <= this.capacity - l) {
			this.#reslice(l + n);
			return l;
		}
		return -1;
	}
	#reslice(len) {
		assert(len <= this.#buf.buffer.byteLength);
		this.#buf = new Uint8Array(this.#buf.buffer, 0, len);
	}
	readSync(p) {
		if (this.empty()) {
			this.reset();
			if (p.byteLength === 0) {
				return 0;
			}
			return null;
		}
		const nread = copy(this.#buf.subarray(this.#off), p);
		this.#off += nread;
		return nread;
	}
	read(p) {
		const rr = this.readSync(p);
		return Promise.resolve(rr);
	}
	writeSync(p) {
		const m = this.#grow(p.byteLength);
		return copy(p, this.#buf, m);
	}
	write(p) {
		const n = this.writeSync(p);
		return Promise.resolve(n);
	}
	#grow(n) {
		const m = this.length;
		if (m === 0 && this.#off !== 0) {
			this.reset();
		}
		const i = this.#tryGrowByReslice(n);
		if (i >= 0) {
			return i;
		}
		const c = this.capacity;
		if (n <= Math.floor(c / 2) - m) {
			copy(this.#buf.subarray(this.#off), this.#buf);
		} else if (c + n > MAX_SIZE) {
			throw new Error('The buffer cannot be grown beyond the maximum size.');
		} else {
			const buf = new Uint8Array(Math.min(2 * c + n, MAX_SIZE));
			copy(this.#buf.subarray(this.#off), buf);
			this.#buf = buf;
		}
		this.#off = 0;
		this.#reslice(Math.min(m + n, MAX_SIZE));
		return m;
	}
	grow(n) {
		if (n < 0) {
			throw Error('Buffer.grow: negative count');
		}
		const m = this.#grow(n);
		this.#reslice(m);
	}
	async readFrom(r) {
		let n = 0;
		const tmp = new Uint8Array(MIN_READ);
		while (true) {
			const shouldGrow = this.capacity - this.length < MIN_READ;
			const buf = shouldGrow ? tmp : new Uint8Array(this.#buf.buffer, this.length);
			const nread = await r.read(buf);
			if (nread === null) {
				return n;
			}
			if (shouldGrow) this.writeSync(buf.subarray(0, nread));
			else this.#reslice(this.length + nread);
			n += nread;
		}
	}
	readFromSync(r) {
		let n = 0;
		const tmp = new Uint8Array(MIN_READ);
		while (true) {
			const shouldGrow = this.capacity - this.length < MIN_READ;
			const buf = shouldGrow ? tmp : new Uint8Array(this.#buf.buffer, this.length);
			const nread = r.readSync(buf);
			if (nread === null) {
				return n;
			}
			if (shouldGrow) this.writeSync(buf.subarray(0, nread));
			else this.#reslice(this.length + nread);
			n += nread;
		}
	}
}
// export { Buffer1 as Buffer };
export const Buffer = Buffer1;
