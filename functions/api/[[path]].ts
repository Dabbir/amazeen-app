import { handleRequest } from '../../src/sync/server/handler';
import type { Env } from '../../src/sync/server/handler';

/**
 * Cloudflare Pages Function: serves /api/* from the same deployment as the app.
 * The logic lives in src/sync/server/handler.ts so it can be tested without Cloudflare.
 */
export const onRequest = (context: { request: Request; env: Env }): Promise<Response> => handleRequest(context.request, context.env);
