import { define } from 'bundt/config';

export default define((input, options) => {
	if (input.export === 'bin') {
		// TS ~> JS only
		delete options.format;
		delete options.external;
		options.bundle = false;
	}
});
