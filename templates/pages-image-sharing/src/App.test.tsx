import { render } from '@testing-library/react';
import { App } from './App';

test("doesn't crash", () => {
	render(<App />);
	expect(2 + 2).toBe(4);
});
