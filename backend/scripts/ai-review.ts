import 'dotenv/config';

import { createModel } from '../src/ai/model.js';
import { createDb } from '../src/db/client.js';

/**
 * `npm run ai:review [days]` — summarises 👎 feedback on DueOra AI so the system prompt
 * (src/ai/systemPrompt.ts) and the knowledge base (src/ai/knowledge/) can be improved.
 * Prints each disliked answer with the question before it and the comment; with
 * GEMINI_API_KEY set, also asks Gemini for the common themes. No names, emails or keys
 * are printed — only the conversation text.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const days = Number(process.argv[2] ?? 30) || 30;
  const db = createDb(url);
  try {
    const since = new Date(Date.now() - days * 86_400_000);
    const feedback = await db.aiFeedback.findMany({
      where: { rating: -1, createdAt: { gte: since } },
      include: { message: { select: { text: true, createdAt: true, conversationId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const positive = await db.aiFeedback.count({ where: { rating: 1, createdAt: { gte: since } } });
    console.log(`DueOra AI feedback, last ${days} days: 👍 ${positive} · 👎 ${feedback.length}\n`);
    if (feedback.length === 0) return;

    const items: string[] = [];
    for (const [i, f] of feedback.entries()) {
      const question = await db.aiMessage.findFirst({
        where: { conversationId: f.message.conversationId, role: 'USER', createdAt: { lte: f.message.createdAt } },
        orderBy: { createdAt: 'desc' },
        select: { text: true },
      });
      const entry = `#${i + 1}\nQ: ${question?.text ?? '(unknown)'}\nA: ${f.message.text}\nComment: ${f.comment ?? '—'}`;
      items.push(entry);
      console.log(`${entry}\n`);
    }

    const model = createModel({ GEMINI_API_KEY: process.env.GEMINI_API_KEY, GEMINI_MODEL: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash' });
    if (model) {
      const r = await model.complete(
        'You review feedback on an in-app assistant. List the 3–5 most common problems, each with a concrete fix to the system prompt or a help article to add. Be brief.',
        items.join('\n\n').slice(0, 30_000),
      );
      console.log('--- Themes (Gemini) ---\n' + r.text);
    } else {
      console.log('Set GEMINI_API_KEY to also get a summary of themes.');
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
