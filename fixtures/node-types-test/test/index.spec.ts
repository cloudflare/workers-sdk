// test/index.spec.ts
import { describe, it, expect } from 'vitest';
import worker from '../src/index';
import { execSync } from 'child_process';

describe('TypeScript Compilation', () => {
	it('should compile without errors', () => {
		try {
			execSync('tsc --noEmit', { stdio: 'pipe' });
			expect(true).toBe(true);
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.error(error.toString());
			}
			expect(error).toBeUndefined();
		}
	});
});
