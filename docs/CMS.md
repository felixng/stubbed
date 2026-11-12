# Public website copy in Sanity

The Next.js site keeps its design and assets. Sanity provides an authenticated browser editor at `/dressingroom`, with seven singleton documents: Landing page, Press kit, About, FAQ and guides, Privacy policy, Terms of service, and Site settings. A public Stubbed account does not grant CMS access; Sanity project membership controls editing.

## Ownership

| Editable in Sanity | Maintained in the repository |
| --- | --- |
| Headlines, paragraphs, feature descriptions, calls to action | Layout, components, styling, icons, feature ordering |
| About and founder story | Application behaviour and user data |
| FAQ questions, answers, existing steps and link labels | FAQ anchor IDs, number/order of questions and steps, destinations of application links |
| Press contact and social URL | App route destinations and download URLs |
| Captions and media usage guidance | Screenshots, logos, app icons, illustrations, promotional artwork and ZIPs, and every image's alt text (`components/landing/alt-text.ts`; Press alts come from the default captions) |
| Page titles, search descriptions, beta label, text-only product summary | Site origin, product name, sitemap routes, generated social artwork |
| Legal page text and each page's last-updated date | Legal operator details, minimum age, jurisdiction and support address (`src/lib/legal.ts`) |

There are no image/file upload fields or editable asset paths in the schema. Screenshots and downloads remain in `apps/web/public/landing`, `public/press`, and `public/brand`. Regenerate promotional artwork/ZIPs with the existing scripts when their baked-in words or screenshots change. Updating a caption does not regenerate those files. Fields containing fragments around existing links or emphasis retain that formatting; edit the surrounding words without removing the spaces that join them.

Most pages edit existing content slots: adding a new layout, FAQ item, instruction step or feature requires a schema/code change, because fixed slots protect screenshot associations, existing links and page structure.

**About is edited as a page of sections** (`aboutPage.sections`, `src/lib/cms/sections.ts`). Each section has an optional heading, rich text (paragraphs, subheadings, bullet and numbered lists, bold, italic, links) and optional buttons; editors add, remove and drag sections freely. Links and buttons accept a site path, `https://` or `mailto:` only; everything else is dropped when the page renders. The repository copy is the fallback until the page is edited, and the old fixed `about` fields stay in the dataset (hidden in Studio) so earlier edits show until then. Privacy and Terms still use fixed slots: their text is interleaved with operator details from `src/lib/legal.ts`.

A cleared field stays empty on the site. A field that was never edited falls back to repository copy.

## One-time setup

1. Create a Sanity project named **Stubbed**, on the free plan, with a **public** dataset named `production`. Store public marketing content only. Published content in a public dataset is readable through the Sanity API; drafts still require authentication.
2. Add these variables locally in `apps/web/.env.local` and to the Vercel project (Production, and Preview if desired):
   - `NEXT_PUBLIC_SANITY_PROJECT_ID`: the project ID.
   - `NEXT_PUBLIC_SANITY_DATASET=production`.
   - `SANITY_API_READ_TOKEN`: a **Viewer** API token, for draft previews. This stays server-only.
   - `SANITY_REVALIDATE_SECRET`: a generated random secret, also entered in the webhook configuration below.
3. In Sanity project settings → API → CORS origins, allow `http://localhost:3000`, `https://getstubbed.app` and any exact Vercel preview origin used for Studio. Enable credentials for those origins so Studio can authenticate. Avoid wildcard credentialed origins.
4. Create a temporary **Editor** API token for initial migration. Set it as `SANITY_API_WRITE_TOKEN` in your local shell, then run `pnpm --filter web cms:seed` from the repo root. The script reads `apps/web/.env.local` for the public project settings. It creates the seven missing published documents in one transaction and never overwrites existing documents. Remove/revoke the write token afterwards; the website does not need it.
5. Deploy the branch, visit `/dressingroom`, and log in with your Sanity account. If Sanity prompts you to register the Studio URL, register that exact deployed URL. Add other editors through Sanity project membership.
6. Add a Sanity API webhook:
   - URL: `https://getstubbed.app/api/cms/revalidate`.
   - Method: POST; trigger on create, update and delete.
   - Filter: `_type in ["landingPage", "pressPage", "aboutPage", "faqPage", "privacyPage", "termsPage", "siteSettings"] && !(_id in path("drafts.**"))`.
   - Projection: `{_id, _type}`.
   - Signing secret: the same `SANITY_REVALIDATE_SECRET`.
   - Keep draft events disabled.
7. Open Studio's **Presentation** tab. Edit a headline and check the unpublished draft in the embedded preview. Confirm a signed-out browser still sees the published version. Publish, then confirm the signed-out page updates without deploying. Close the preview with the **Exit content preview** button (bottom-left, only on a directly opened preview; Presentation and Studio manage draft mode themselves).

If Studio is disabled, check the public project ID and redeploy: `NEXT_PUBLIC_` variables are embedded at build time. An empty or unavailable CMS falls back to repository copy. Missing/blank/malformed fields fall back individually. Publishing does not need a Git commit or a Vercel deployment. Published copy uses one tagged application cache. The signed webhook immediately expires it and invalidates the root layout’s prerendered route output; the next visit regenerates the page and the next read fetches published content directly from the Sanity API, bypassing the CDN and the Next.js fetch cache. A short server cache also bounds ordinary reads. Sanity Live remains mounted for preview refreshes, but published copy invalidation relies on the webhook or the cache lifetime. The webhook is recommended for reliable updates even when no browser is subscribed to live events.

## Editing

1. Open `https://getstubbed.app/dressingroom` and select the relevant page.
2. Expand the named section, change text, and inspect it in Presentation. Click-to-edit overlays connect rendered copy to its field. Preview changes are shown within Studio; no read token is sent to public browsers.
3. Publish when ready. Previewing or saving drafts never publishes them.

Site settings includes the shared beta badge, default search description, press email, social URL and `llms.txt` introduction/status. These are separate editorial fields: when launch status changes, update the relevant descriptions and FAQ answer too. The FAQ HTML, FAQ structured data and `llms.txt` answers use the same source. Legal dates are per document; bump the relevant date when policy text changes, following the existing notification commitments.

Sanity retains document history according to the selected plan. Use Studio history to restore an earlier version. Do not rerun the seed expecting it to reset copy; it deliberately preserves existing edits.

Studio shows "Unknown fields found" when a document holds fields the schema no longer defines (for example after a field is removed from `definitions.ts`). Run `pnpm --filter web cms:prune` with `SANITY_API_WRITE_TOKEN` set to list them, and add `--apply` to remove them, drafts included. Revoke the token afterwards.

## Development and verification

`src/lib/cms/definitions.ts` is the explicit allowlist and the repository fallback copy. `sanity.config.ts` derives copy-only schemas from it; `src/lib/cms/model.ts` creates initial documents and validates CMS values. Changes to the content/asset boundary belong in both the schema/default definitions and this guide.

Normal builds and tests work with no Sanity account. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`. Tests cover partial/malformed content, seed coverage, FAQ migration and contact-link validation. Live account/CORS/preview/webhook verification requires a configured Sanity project and deployment; do not treat the local fallback build as evidence that those settings are correct.
