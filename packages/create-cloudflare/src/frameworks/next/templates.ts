const bindings = `
	// https://developers.cloudflare.com/workers/configuration/bindings/
	// In Next.js bindings to KV, R2, Durable Objects, Queues, D1 and more
	// are exposed via process.env, as shown below:
	//
	// const myKv = process.env['MY_KV_NAMESPACE'];
	// await myKv.put('foo', 'bar');
	// const valueFromKv = await myKv.get('foo');
	//
	// Each binding must be configured in your project's next.config.js file:
	// https://developers.cloudflare.com/pages/framework-guides/deploy-a-nextjs-site/#use-bindings-in-your-nextjs-application
`;

export const apiPagesDirHelloTs = `
// Next.js Edge API Routes: https://nextjs.org/docs/pages/building-your-application/routing/api-routes#edge-api-routes

import type { NextRequest } from 'next/server'

export const config = {
  runtime: 'edge',
}

export default async function handler(req: NextRequest) {
${bindings}

  return new Response(JSON.stringify({ name: 'John Doe' }))
}
`;

export const apiPagesDirHelloJs = `
// Next.js Edge API Routes: https://nextjs.org/docs/pages/building-your-application/routing/api-routes#edge-api-routes

export const config = {
  runtime: 'edge',
}

export default async function handler(req) {
${bindings}

  return new Response(JSON.stringify({ name: 'John Doe' }))
}
`;

export const apiAppDirHelloTs = `
// Next.js Edge API Route Handlers: https://nextjs.org/docs/app/building-your-application/routing/router-handlers#edge-and-nodejs-runtimes

import type { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
${bindings}


  return new Response(JSON.stringify({ name: 'John Doe' }))
}
`;

export const apiAppDirHelloJs = `
// Next.js Edge API Route Handlers: https://nextjs.org/docs/app/building-your-application/routing/router-handlers#edge-and-nodejs-runtimes

export const runtime = 'edge'

export async function GET(request) {
${bindings}

  return new Response(JSON.stringify({ name: 'John Doe' }))
}
`;

// Simplified and adjusted version of the Next.js built-in not-found component (https://github.com/vercel/next.js/blob/1c65c5575/packages/next/src/client/components/not-found-error.tsx)
export const appDirNotFoundJs = `
export const runtime = "edge";

export default function NotFound() {
  return (
    <>
      <title>404: This page could not be found.</title>
      <div style={styles.error}>
        <div>
          <style
            dangerouslySetInnerHTML={{
              __html: \`body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}\`,
            }}
          />
          <h1 className="next-error-h1" style={styles.h1}>
            404
          </h1>
          <div style={styles.desc}>
            <h2 style={styles.h2}>This page could not be found.</h2>
          </div>
        </div>
      </div>
    </>
  );
}

const styles = {
  error: {
    fontFamily:
      'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
    height: "100vh",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },

  desc: {
    display: "inline-block",
  },

  h1: {
    display: "inline-block",
    margin: "0 20px 0 0",
    padding: "0 23px 0 0",
    fontSize: 24,
    fontWeight: 500,
    verticalAlign: "top",
    lineHeight: "49px",
  },

  h2: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: "49px",
    margin: 0,
  },
};
`;

// Simplified and adjusted version of the Next.js built-in not-found component (https://github.com/vercel/next.js/blob/1c65c5575/packages/next/src/client/components/not-found-error.tsx)
export const appDirNotFoundTs = `
export const runtime = "edge";

export default function NotFound() {
  return (
    <>
      <title>404: This page could not be found.</title>
      <div style={styles.error}>
        <div>
          <style
            dangerouslySetInnerHTML={{
              __html: \`body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}\`,
            }}
          />
          <h1 className="next-error-h1" style={styles.h1}>
            404
          </h1>
          <div style={styles.desc}>
            <h2 style={styles.h2}>This page could not be found.</h2>
          </div>
        </div>
      </div>
    </>
  );
}

const styles = {
  error: {
    fontFamily:
      'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
    height: "100vh",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },

  desc: {
    display: "inline-block",
  },

  h1: {
    display: "inline-block",
    margin: "0 20px 0 0",
    padding: "0 23px 0 0",
    fontSize: 24,
    fontWeight: 500,
    verticalAlign: "top",
    lineHeight: "49px",
  },

  h2: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: "49px",
    margin: 0,
  },
} as const;
`;


export const nextConfig = `
/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = nextConfig

// https://developers.cloudflare.com/pages/framework-guides/deploy-a-nextjs-site/#use-bindings-in-your-nextjs-application
// This code ensures that bindings to resources like
// KV, R2, Durable Objects, Queues, D1 are available in
// local development when running the next dev command, which
// runs a Node.js based local development server.
if (process.env.NODE_ENV === 'development') {
    import('@cloudflare/next-on-pages/__experimental__next-dev').then(({ setupDevBindings }) => {

				// https://developers.cloudflare.com/workers/configuration/bindings/
				// Each binding you want to expose via process.env must be configured via setupDevBindings()
        setupDevBindings({
            kvNamespaces: ['MY_KV_NAMESPACE'],
        });
    });
}
`;
