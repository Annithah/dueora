import { Router } from 'express';

import { articles } from '../ai/knowledge.js';
import type { AppContext } from '../context.js';

/** GET /help/articles — the in-app FAQ (the same articles DueOra AI answers "How do I…?" from). Public. */
export function helpRouter(_ctx: AppContext): Router {
  const router = Router();
  router.get('/articles', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(articles());
  });
  return router;
}
