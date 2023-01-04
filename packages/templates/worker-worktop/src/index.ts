import { Router } from 'worktop';
import { compose } from 'worktop';
import * as CORS from 'worktop/cors';

import { start } from 'worktop/cfw';
import * as Cache from 'worktop/cfw.cache';

import { Auth } from './routes/auth';
import { Todos } from './routes/todos';

import type { Context } from './context';

const API = new Router<Context>();

API.prepare = compose(
	Cache.sync(),
	CORS.preflight({
		maxage: 3600,
		credentials: true,
	})
);

API.mount('/auth/', Auth);
API.mount('/todos/', Todos);

API.add('GET', '/', (req, context) => {
	return new Response('OK');
});

// Initialize: Module Worker
export default start(API.run);
