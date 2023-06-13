import worker from '../src/up';

type methods = 'GET' | 'POST';

export async function run(method?: methods, num?: number) {
	let url = 'https://example.com';
	if (num != null) url += '?bytes=' + num;
	let req = new Request(url, { method });
	return worker(req);
}
