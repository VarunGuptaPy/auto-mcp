/**
 * Catch-all proxy to FastAPI.
 *
 * Next.js rewrites() don't reliably forward POST bodies in dev mode, so we
 * use an explicit Route Handler instead. Every request to /api/* is proxied
 * server-side to the FastAPI backend (API_URL env var, default :8000).
 *
 * SSE (text/event-stream) responses stream through unchanged because we
 * return the upstream ReadableStream directly.
 */

import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

async function proxy(
  request: NextRequest,
  context: { params: { path: string[] } },
) {
  const path = context.params.path.join("/");
  const search = request.nextUrl.search;
  const target = `${API_URL}/api/${path}${search}`;

  // Forward all headers except `host` (which must match the upstream server)
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "host") headers[key] = value;
  });

  const init: RequestInit = { method: request.method, headers };

  // Forward the raw body as an ArrayBuffer so binary data (multipart/form-data
  // file uploads) is not corrupted. request.text() mangles non-UTF-8 bytes.
  if (request.method !== "GET" && request.method !== "HEAD") {
    const buf = await request.arrayBuffer();
    if (buf.byteLength > 0) init.body = buf;
  }

  const upstream = await fetch(target, init);

  const upstreamHeaders: Record<string, string> = {};
  upstream.headers.forEach((value, key) => {
    upstreamHeaders[key] = value;
  });

  // Return the body stream directly — this keeps SSE alive end-to-end
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstreamHeaders,
  });
}

export const GET    = proxy;
export const POST   = proxy;
export const PUT    = proxy;
export const PATCH  = proxy;
export const DELETE = proxy;
