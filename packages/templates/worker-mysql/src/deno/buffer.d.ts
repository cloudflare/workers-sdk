export class Buffer {
	write(p: Uint8Array): Promise<number>;
	read(p: Uint8Array): Promise<number | null>;
	get length(): number;
}
