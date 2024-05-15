import worker from '../src/index';

type methods = 'GET' | 'POST';
type directions = 'up' | 'down';

export async function run(direction: directions, method?: methods, num?: number) {
	let url = `https://example.com/${direction}`;
	if (num != null) url += '?bytes=' + num;
	let req = new Request(url, { method });
	return worker.fetch(req);
}
