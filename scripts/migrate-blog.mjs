#!/usr/bin/env node
// One-time importer; uses the original Astro project's installed Markdown tools.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const source = path.resolve(process.argv[2] || '../Blog')
const destination = path.resolve(process.argv[3] || 'site')
const requireSource = createRequire(path.join(source, 'package.json'))
const requireMath = createRequire(requireSource.resolve('remark-math'))
const yaml = requireSource('js-yaml')
const load = async name => import(pathToFileURL(requireMath.resolve(name)))
const { unified } = await load('unified')
const { default: remarkParse } = await load('remark-parse')
const { default: remarkMath } = await load('remark-math')
const { default: remarkDirective } = await load('remark-directive')
const pnpmRoot = path.join(source, 'node_modules/.pnpm')
const gfmPackage = fs.readdirSync(pnpmRoot).find(name => name.startsWith('remark-gfm@'))
const { default: remarkGfm } = await import(pathToFileURL(path.join(pnpmRoot, gfmPackage, 'node_modules/remark-gfm/index.js')))
const tomlPackage = fs.readdirSync(pnpmRoot).find(name => name.startsWith('smol-toml@'))
const { parse: parseTOML } = await import(pathToFileURL(path.join(pnpmRoot, tomlPackage, 'node_modules/smol-toml/dist/index.js')))
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkDirective)
const postsRoot = path.join(source, 'src/content/posts')
const registry = new Map()
const routes = new Set()
const report = { posts: [], assets: [], repairedSourceLinks: [], unresolvedLinks: [], rewrittenLinks: 0, directives: 0, highlights: 0 }
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const routeEncode = value => value.split('/').map(encodeURIComponent).join('/')
const escapeHTML = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const categoryConfig = fs.readFileSync(path.join(source, 'src/data/categories.toml'), 'utf8')
const categoryTree = parseTOML(categoryConfig).categories
const categoryByInput = new Map()
const categoriesBySlug = new Map()
function registerCategories(nodes, ancestors = []) {
  for (const node of nodes) {
    node.ancestors = ancestors
    categoriesBySlug.set(node.slug, node)
    for (const key of [node.name, node.slug, ...(node.aliases || [])]) categoryByInput.set(key, node)
    registerCategories(node.children || [], [node.slug, ...ancestors])
  }
}
registerCategories(categoryTree)

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.name.startsWith('.')) return []
    const file = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink: ${file}`)
    return entry.isDirectory() ? walk(file) : [file]
  })
}

function readPost(file) {
  const text = fs.readFileSync(file, 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) throw new Error(`Missing YAML front matter: ${file}`)
  return { file, metadata: yaml.load(match[1]), body: text.slice(match[0].length), sha256: sha256(text) }
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

function copy(file, relativeDestination) {
  const target = path.join(destination, 'static', relativeDestination)
  const bytes = fs.readFileSync(file)
  if (fs.existsSync(target) && sha256(fs.readFileSync(target)) !== sha256(bytes)) {
    throw new Error(`Asset collision: ${target}`)
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(file, target)
  report.assets.push({ source: path.relative(source, file), destination: `static/${relativeDestination}`, sha256: sha256(bytes), bytes: bytes.length })
}

for (const file of walk(postsRoot).filter(file => /\.mdx?$/.test(file))) {
  const post = readPost(file)
  const relative = path.relative(postsRoot, file).replaceAll(path.sep, '/')
  const slug = post.metadata.abbrlink || relative.replace(/\.mdx?$/, '')
  const languagePrefix = post.metadata.lang && post.metadata.lang !== 'zh' ? `/${post.metadata.lang}` : ''
  post.route = `${languagePrefix}/posts/${slug}/`
  if (routes.has(post.route)) throw new Error(`Duplicate article URL: ${post.route}`)
  routes.add(post.route)
  registry.set(file, post)
}

function rewriteURL(url, post) {
  if (!url || /^(?:[a-z][a-z\d+.-]*:|\/\/|\?)/i.test(url)) return url
  const [, rawPath, originalSuffix = ''] = /^([^?#]*)([?#].*)?$/.exec(url)
  const suffix = originalSuffix.replace(/#(.+)$/, (_, fragment) => '#' + encodeURIComponent(
    decodeURIComponent(fragment).toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s+/g, '-')))
  if (!rawPath) return suffix
  const decoded = decodeURIComponent(rawPath)
  if (rawPath.startsWith('/')) return url
  let target = path.resolve(path.dirname(post.file), decoded)
  if (!fs.existsSync(target)) {
    const candidates = walk(path.join(source, 'src/content')).filter(file => path.basename(file) === path.basename(decoded))
    if (candidates.length === 1) {
      target = candidates[0]
      report.repairedSourceLinks.push({ source: path.relative(source, post.file), original: url, target: path.relative(source, target) })
    }
  }
  if (registry.has(target)) return routeEncode(registry.get(target).route) + suffix
  if (!target.startsWith(path.join(source, 'src/content') + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    report.unresolvedLinks.push({ source: path.relative(source, post.file), url })
    return url
  }
  return '/media/' + routeEncode(path.relative(path.join(source, 'src/content'), target).replaceAll(path.sep, '/')) + suffix
}

function convertBody(post) {
  const body = post.body
  const tree = parser.parse(body)
  const edits = []
  const add = (start, end, text) => edits.push({ start, end, text })
  const rewrite = url => {
    const result = rewriteURL(url, post)
    if (result !== url) report.rewrittenLinks++
    return result
  }
  function visit(node) {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (node.type === 'math') {
      // Fenced math protects multiline TeX from Goldmark's setext/list parsers.
      // Only delimiters change; indentation, quotes and all TeX remain intact.
      const opening = /^\${2,}/.exec(body.slice(start))[0]
      const closing = /\${2,}[ \t]*$/.exec(body.slice(start, end))
      if (!closing) throw new Error(`Unclosed display math in ${post.file}`)
      add(start, start + opening.length, '```math')
      add(start + closing.index, end, '```')
      return
    }
    if (['code', 'inlineCode', 'inlineMath'].includes(node.type)) return
    if (['link', 'image', 'definition'].includes(node.type)) {
      const next = rewrite(node.url)
      if (next !== node.url) {
        const segment = body.slice(start, end)
        // URLs containing literal spaces use angle brackets in Markdown.
        const encoded = node.url.replaceAll(' ', '%20')
        let index = segment.lastIndexOf(node.url)
        let length = node.url.length
        if (index < 0) { index = segment.lastIndexOf(encoded); length = encoded.length }
        if (index < 0) throw new Error(`Cannot locate Markdown URL: ${node.url}`)
        add(start + index, start + index + length, next)
      }
    }
    if (node.type === 'html') {
      const segment = body.slice(start, end)
      const converted = segment.replace(/\b(href|src)=(['"])(.*?)\2/g, (_, attribute, quote, url) => `${attribute}=${quote}${rewrite(url)}${quote}`)
      if (converted !== segment) add(start, end, converted)
      return
    }
    if (node.type === 'containerDirective') {
      const firstLineEnd = body.indexOf('\n', start)
      const lastLineStart = body.lastIndexOf('\n', end - 1) + 1
      const label = node.children[0]?.data?.directiveLabel
        ? node.children[0].children.map(child => child.value || '').join('') : ''
      let opening, closing
      if (node.name === 'gallery') {
        opening = '<div class="gallery-container">'; closing = '</div>'
      } else if (node.name === 'fold') {
        opening = `<details>\n<summary>${escapeHTML(label)}</summary>`; closing = '</details>'
      } else if (['note', 'tip', 'important', 'warning', 'caution'].includes(node.name)) {
        opening = `<div class="admonition admonition-${node.name}">\n<strong class="admonition-title">${escapeHTML(label || node.name.toUpperCase())}</strong>`
        closing = '</div>'
      } else throw new Error(`Unsupported directive: ${node.name}`)
      add(start, firstLineEnd, opening + '\n')
      add(lastLineStart, end, '\n' + closing)
      report.directives++
    }
    if (node.type === 'text') {
      const segment = body.slice(start, end)
      for (const match of segment.matchAll(/==([^\n=](?:(?!==)[^\n])*?)==/g)) {
        add(start + match.index, start + match.index + match[0].length, `<mark>${escapeHTML(match[1])}</mark>`)
        report.highlights++
      }
    }
    for (const child of node.children || []) visit(child)
  }
  visit(tree)
  edits.sort((a, b) => b.start - a.start)
  let result = body, previous = body.length
  for (const edit of edits) {
    if (edit.end > previous) throw new Error(`Overlapping Markdown edits in ${post.file}`)
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
    previous = edit.start
  }
  return result
}

function literalContent(body) {
  const literals = []
  function visit(node) {
    if (['code', 'inlineCode', 'math', 'inlineMath'].includes(node.type)) {
      const type = node.type === 'code' && node.lang === 'math' ? 'math' : node.type
      const value = ['math', 'inlineMath'].includes(type) ? node.value.trim() : node.value
      literals.push([type, type === 'math' ? '' : node.lang || '', node.meta || '', value])
    }
    for (const child of node.children || []) visit(child)
  }
  visit(parser.parse(body))
  return literals
}

for (const post of registry.values()) {
  const original = post.metadata
  const folder = path.relative(postsRoot, post.file).split(path.sep)[0]
  let category = categoryByInput.get(original.category) || categoryByInput.get(folder)
  if (!category && original.category) {
    category = { name: original.category, slug: original.category.trim().toLowerCase().replace(/\s+/g, '-'), ancestors: [] }
    categoriesBySlug.set(category.slug, category)
  }
  const metadata = { ...original, date: original.published, lastmod: original.updated || original.published,
    author: 'Languisher', categories: category ? [category.slug, ...category.ancestors] : [],
    show_toc: original.toc, weight: original.pin ? -original.pin : 0, url: post.route,
    aliases: original.lang ? [] : [`/en${post.route}`], math: true, migrated: true,
    disable_math: true, disable_highlight: true }
  const body = convertBody(post)
  const before = literalContent(post.body), after = literalContent(body)
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    const index = before.findIndex((item, index) => JSON.stringify(item) !== JSON.stringify(after[index]))
    console.error({ index, before: before[index], after: after[index] })
    throw new Error(`Code or mathematical source changed: ${post.file}`)
  }
  const relative = path.relative(postsRoot, post.file)
  const target = `content/blog/${relative}`
  write(path.join(destination, target), `---\n${yaml.dump(metadata, { lineWidth: -1, noRefs: true })}---\n${body}`)
  report.posts.push({ source: path.relative(source, post.file), destination: target, route: post.route,
    sourceSha256: post.sha256, draft: Boolean(original.draft), categories: metadata.categories, sourceMetadata: original,
    mathExpressions: before.filter(item => ['math', 'inlineMath'].includes(item[0])).length,
    codeBlocks: before.filter(item => item[0] === 'code').length })
}

write(path.join(destination, 'data/categories.toml'), categoryConfig)
for (const category of categoriesBySlug.values()) {
  write(path.join(destination, 'content/categories', category.slug, '_index.md'),
    `---\n${yaml.dump({ title: category.name, url: `/categories/${category.slug}/` })}---\n`)
}
write(path.join(destination, 'data/legacy_posts.json'), JSON.stringify(Object.fromEntries(
  report.posts.map(post => [post.route, post.destination.replace(/^content\//, '')])), null, 2) + '\n')

for (const collection of ['posts', 'about']) {
  const root = path.join(source, 'src/content', collection)
  for (const file of walk(root).filter(file => !/\.mdx?$/.test(file))) {
    copy(file, `media/${collection}/${path.relative(root, file)}`)
  }
}
for (const file of walk(path.join(source, 'public'))) copy(file, path.relative(path.join(source, 'public'), file))

// Keep the old profile and course-links page, including their source language.
for (const [input, output, title, url, weight] of [
  ['about/about-zh.md', 'about.md', '关于', '/about/', 10],
  ['about/about-en.md', 'about-en.md', 'About', '/en/about/', null],
  ['other/other-zh.md', 'other.md', '其他', '/other/', 50],
]) {
  const post = readPost(path.join(source, 'src/content', input))
  const metadata = { ...post.metadata, title, url, author: 'Languisher', show_toc: false }
  if (weight) metadata.menu = { main: { name: title, weight } }
  write(path.join(destination, 'content', output), `---\n${yaml.dump(metadata, { lineWidth: -1 })}---\n${convertBody(post)}`)
}

report.summary = { posts: report.posts.length, published: report.posts.filter(post => !post.draft).length,
  drafts: report.posts.filter(post => post.draft).length, assets: report.assets.length,
  assetBytes: report.assets.reduce((sum, asset) => sum + asset.bytes, 0) }
write(path.join(destination, '../migration-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report.summary, rewrittenLinks: report.rewrittenLinks, directives: report.directives, highlights: report.highlights }, null, 2))
if (report.unresolvedLinks.length) {
  console.error(JSON.stringify(report.unresolvedLinks, null, 2))
  process.exitCode = 1
}
