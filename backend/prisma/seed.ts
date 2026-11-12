/**
 * `npm run db:seed` — nothing to insert. DueOra never seeds demo users, workspaces, bills or
 * payments, and categories are per company (picked from src/config/categorySuggestions.ts
 * when a company is created). Kept so `prisma db seed` and old docs still work.
 */
process.stdout.write('✅ Nothing to seed: all data is entered in the app.\n');
