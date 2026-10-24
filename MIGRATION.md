# Blog migration

Source: `../Blog/src/content/posts/` (Astro). Destination: `site/content/blog/`
(Hugo Paged). The original Blog directory is read only during migration.

The current source contains 89 posts: 76 published and 13 drafts. All 228 post
attachments, both profile attachments, and 102 public assets are copied with
SHA-256 verification. Local KaTeX styles and fonts are added separately.
`migration-report.json` records every source article and asset, its destination,
checksum, metadata, and the 21 repaired source links. The two theme example posts
and example documentation remain in the repository as drafts.

## Front matter

Every original YAML key is preserved. Hugo-specific keys are added:

| Original key | Hugo behavior |
| --- | --- |
| `title`, `description`, `tags` | Preserved directly |
| `published` | Also written to `date` |
| `updated` | Also written to `lastmod`; falls back to `published` when empty |
| `category` | Original value preserved; `categories` uses configured slugs and ancestors |
| `draft` | Preserved; omitted from production pages, search, RSS and sitemap |
| `pin` | Also mapped to negative `weight`; higher pins sort first |
| `toc` | Also mapped to `show_toc`; explicit `false` is respected |
| `lang` | Preserved; original language-dependent post routes are retained |
| `abbrlink` | Preserved; `url` keeps `/posts/<abbrlink>/` |

Universal posts keep `/en/posts/.../` aliases. The original category tree and
aliases are retained in `site/data/categories.toml`. Category pages keep their
original slug URLs. The Chinese profile, English profile and course-links page
are migrated as well.

## Markdown and attachments

- Local article and attachment links are rewritten from parsed Markdown nodes;
  code blocks and inline code are excluded from link rewriting.
- Display-math delimiters become fenced `math` blocks, with the TeX unchanged.
  This prevents Goldmark treating standalone `=`, `>` or `-` lines as Markdown.
  Inline `$...$` and `\(...\)` formulas use a passthrough render hook. Both are
  rendered at build time with `transform.ToMath`; parse errors fail the build.
- KaTeX CSS and fonts are hosted locally. Code uses Hugo's GitHub highlighting
  theme, and the existing theme supplies copy buttons and footnotes.
- Astro note/warning directives, collapsible blocks and galleries become HTML
  containers supported by the site's stylesheet. PDF image references become
  readable PDF links.
- Attachments keep their original bytes and directory structure under
  `site/static/media/posts/` and `site/static/media/about/`. All original public
  assets are copied into `site/static/`, including fonts and icons.
- Source links to draft articles remain in Markdown. The production link render
  hook displays them as unpublished references instead of generating dead links.
  Changing the target's `draft` to `false` automatically restores its link.

## Reproduce and verify

The one-time importer uses the original Astro project's installed Node packages,
including its pnpm dependencies. It is not needed for normal Hugo builds.
Do not rerun it over edited migrated articles without reviewing the result.

```sh
node scripts/migrate-blog.mjs ../Blog site
hugo --source site --themesDir ../.. --theme "$(basename "$PWD")" \
  --destination /private/tmp/languisher-migration-production \
  --cacheDir /private/tmp/languisher-hugo-cache --minify
python3 scripts/verify-migration.py ../Blog /private/tmp/languisher-migration-production
```

The verifier requires PyYAML and BeautifulSoup4. Use a fresh destination for
verification so removed or newly drafted pages cannot survive from an old build.
It compares all source metadata and asset hashes, checks every published route,
math and code-block counts, TOC settings, archive order, draft exclusion, local
HTML links and anchors, and CSS font references. Results are saved in
`migration-verification.json`.

The final production verification covers 1,799 mathematical expressions and
4,400 local HTML references with no missing files or anchors. All 89 imported
articles also render successfully in the draft preview. Browser checks cover
the homepage, archive, categories, profile, formula-heavy articles, TOC-disabled
articles, and a 390-pixel mobile viewport; no page errors, failed HTTP responses,
broken images, or horizontal page overflow were observed.

For future writing, use Hugo's `date`, `lastmod`, `categories`, `tags`, `draft`,
`weight`, `show_toc` and `url` fields. Keeping `url` stable preserves existing
links. Original Astro keys are kept for provenance; Hugo uses the mapped fields.

Official references: [front matter](https://gohugo.io/content-management/front-matter/),
[math rendering](https://gohugo.io/functions/transform/tomath/),
[passthrough hooks](https://gohugo.io/render-hooks/passthrough/).
