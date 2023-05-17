export const apiPagesDirHelloTs = `
// Next.js Edge API Routes: https://nextjs.org/docs/pages/building-your-application/routing/api-routes#edge-api-routes

import type { NextRequest } from 'next/server'

export const config = {
  runtime: 'edge',
}

export default async function handler(req: NextRequest) {
  return new Response(JSON.stringify({ name: 'John Doe' }))
}
`;

export const apiPagesDirHelloJs = `
// Next.js Edge API Routes: https://nextjs.org/docs/pages/building-your-application/routing/api-routes#edge-api-routes

export const config = {
  runtime: 'edge',
}

export default async function handler(req) {
  return new Response(JSON.stringify({ name: 'John Doe' }))
}
`;

export const apiAppDirHelloTs = `
// Next.js Edge API Route Handlers: https://nextjs.org/docs/app/building-your-application/routing/router-handlers#edge-and-nodejs-runtimes

import type { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  return new Response(JSON.stringify({ name: 'John Doe' }))
}
`;

export const apiAppDirHelloJs = `
// Next.js Edge API Route Handlers: https://nextjs.org/docs/app/building-your-application/routing/router-handlers#edge-and-nodejs-runtimes

export const runtime = 'edge'

export async function GET(request) {
  return new Response(JSON.stringify({ name: 'John Doe' }))
}
`;
