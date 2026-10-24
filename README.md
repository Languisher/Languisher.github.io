# HUGO PAGED

## Website deployment

The website at <https://languisher.github.io/> is built from `site/` by
`.github/workflows/deploy.yml`. GitHub Pages must use **GitHub Actions** as its
publishing source. Push changes to `main` to publish; check the repository's
Actions tab for build and deployment status. Generated `site/public/` files are
not committed.

Article content and attachments were migrated from the original Astro Blog.
See [MIGRATION.md](MIGRATION.md) for front matter mappings and verification.

## _For the love of printed media_

A Hugo theme inspired by the paged.js website. See <https://paged.yihui.org> for a demo.

## Development

```
git clone https://github.com/yihui/hugo-paged.git
cd hugo-paged
hugo server --source exampleSite --themesDir ../.. --theme "$(basename "$PWD")"
```

Run this command from the theme repository root. The `--theme` argument uses the
current directory name, so the example also works when the checkout is renamed.

## Chinese typography in this site

The local site is in `site/`; preview it from the repository root:

```sh
hugo server --source site --themesDir ../.. --theme "$(basename "$PWD")"
```

`site/hugo.yaml` sets `locale: zh-CN`, `defaultContentLanguage: zh`, and
`hasCJKLanguage: true`. Chinese content can be written directly in UTF-8 Markdown.

Typography follows [Yihui Xie's font stylesheet](https://yihui.org/css/fonts.css)
and [Chinese page detection](https://github.com/yihui/yihui.org/blob/master/layouts/_partials/html_open.html):

- `site/static/css/fonts.css` overrides the theme's stylesheet. Body text uses
  Source Han Serif or a local Songti font; quotations, emphasis, and Chinese code
  text use Kai fonts. Latin text uses the author's Palatino font stack.
- Installed fonts take priority. If unavailable, the browser loads the author's
  font subsets from `https://cdn.jsdelivr.net/gh/yihui/cron/fonts/`. These are
  subsets of characters used on his site, so other characters may fall back to
  system fonts. Installing the full Source Han Serif font gives broader coverage.
- `site/layouts/_partials/html_open.html` detects Chinese titles and `/cn/` paths,
  and also honors this site's Chinese locale. The CSS applies Chinese typography
  to the homepage and English-titled pages when their HTML language is Chinese.

This adopts the font configuration without requiring `/cn/` and `/en/` content
directories. See the author's [site architecture notes](https://yihui.org/cn/about/#本站架构).
