import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * DueOra's knowledge base: one short Markdown article per feature in ./knowledge/*.md
 * ("# Question?" then the answer). The same articles power the in-app FAQ
 * (GET /help/articles) and DueOra AI's app-help answers, so they never drift apart.
 * Articles describe how DueOra works — never any customer's data.
 */
export interface Article {
  slug: string;
  title: string;
  body: string;
}

const DIR = fileURLToPath(new URL('./knowledge/', import.meta.url));
let cache: Article[] | undefined;

export function articles(): Article[] {
  cache ??= readdirSync(DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const text = readFileSync(`${DIR}${file}`, 'utf8').replace(/\r\n/g, '\n').trim();
      const [first = '', ...rest] = text.split('\n');
      return { slug: file.replace(/^\d+-/, '').replace(/\.md$/, ''), title: first.replace(/^#\s*/, '').trim(), body: rest.join('\n').trim() };
    });
  return cache;
}

/** Articles most relevant to a question (simple word overlap — the set is small). */
export function searchArticles(query: string, limit = 3): Article[] {
  const words = new Set(query.toLowerCase().match(/[a-zà-ÿ]{3,}/g) ?? []);
  if (words.size === 0) return [];
  return articles()
    .map((a) => {
      const hay = `${a.title} ${a.body}`.toLowerCase();
      let score = 0;
      for (const w of words) if (hay.includes(w)) score += a.title.toLowerCase().includes(w) ? 3 : 1;
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}

/** The whole knowledge base as one block for the model's context. */
export function knowledgeText(): string {
  return articles()
    .map((a) => `## ${a.title}\n${a.body}`)
    .join('\n\n');
}
