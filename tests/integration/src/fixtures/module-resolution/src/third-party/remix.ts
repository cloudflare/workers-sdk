import { json, createCookie } from '@remix-run/cloudflare';

export default {
  '(remix) typeof cloudflare json({})': typeof json({}),
  '(remix) remixRunCloudflareCookieName': createCookie(
    'my-remix-run-cloudflare-cookie',
  ).name,
};
