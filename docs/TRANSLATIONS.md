# Translations

DueOra uses **i18next** (`mobile/src/i18n/`). English (`en.ts`) is the source. French (`fr.ts`) and
Kinyarwanda (`rw.ts`) translate the main screens; anything they don't translate falls back to English, so
nothing ever shows a raw key. A test (`i18n.test.ts`) checks that every French/Kinyarwanda key exists in
English and keeps the same `{{placeholders}}`.

- The language follows the phone on first launch (French or Kinyarwanda phones start in that language;
  everything else in English). Settings → Language changes it instantly; the choice is saved on the
  phone and on the account (`PATCH /me { locale }`).
- Names, amounts and dates are never translated — they come from the user's own data.
- DueOra AI replies in the user's language on its own (see `backend/src/ai/systemPrompt.ts`).

## What is translated today

| Area | English | French | Kinyarwanda |
|---|---|---|---|
| Tab bar, onboarding, welcome | ✅ | ✅ | ✅ draft |
| Home: greeting, cards, sections, quick actions | ✅ | ✅ | ✅ draft |
| More menu | ✅ | ✅ | partly (falls back to English) |
| Alerts | ✅ | ✅ | ✅ draft |
| Language and theme names | ✅ | ✅ | ✅ draft |
| Other screens (forms, settings details, reports, emails, notifications) | English text in code | — | — |

The remaining screens still carry their English text inline. Moving them into `en.ts` is mechanical
(`t('…')` + a key) and can be done screen by screen; each move should add the French and Kinyarwanda
strings at the same time. Push notifications and emails are written by the server in English for now.

## Please review (owner)

**Kinyarwanda — all of `rw.ts` is a first draft** and needs a native speaker. Points I'm least sure of:

| Key | Draft | Question |
|---|---|---|
| `tabs.subscriptions` | Ifatabuguzi | Is this the word people use for a recurring subscription? Alternatives: "Abonema", "Kwiyandikisha". |
| `home.goodAfternoon` / `home.goodEvening` | Mwiriwe | Both use "Mwiriwe" — is a separate evening greeting better? |
| `home.budget` | Ingengo y'imari y'ukwezi | Too formal for a card label? |
| `more.eyebrow` | Aho ukorera | "Workspace" — would "Ikigo" or keeping "Workspace" read better? |
| `welcome.tagline` | Ibyo wishyura, ku gihe. | Does it keep the warmth of "Your dues, on time."? |
| `onboarding.slide1Text` | Hosting, domain, ubukode, amazi n'amashanyarazi … | "Hosting" and "domain" left in English on purpose — OK? |
| `theme.system` | Nk'uko telefoni imeze | Natural for "Match phone"? |

**French — please check:**

| Key | Draft | Question |
|---|---|---|
| `home.needsAttention` | À traiter | Or "À surveiller"? |
| `home.qaRecord` | Paiement | Short for the tile; "Enregistrer un paiement" doesn't fit. |
| `alerts.swipeRead` | Lu | Swipe action label — fine this short? |
| `more.import` | Importer un tableur | Or "Importer depuis Excel/CSV"? |

When you've reviewed a string, edit it in `mobile/src/i18n/rw.ts` or `fr.ts` and remove its row here.
Because the app uses EAS Update, corrected translations reach installed phones without a reinstall.
