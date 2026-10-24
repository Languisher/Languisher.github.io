#!/usr/bin/env python3
"""Verify source metadata, attachment hashes, publication status and built links.

Requires PyYAML and BeautifulSoup4. Run after a clean production Hugo build.
"""
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

import yaml
from bs4 import BeautifulSoup

REPO = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]).resolve()
PUBLIC = Path(sys.argv[2]).resolve()
REPORT = json.loads((REPO / 'migration-report.json').read_text())
errors = []


def check(condition, message):
    if not condition:
        errors.append(message)


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def frontmatter(file):
    return yaml.safe_load(file.read_text().split('---', 2)[1])


def normalized(value):
    # JSON records timestamps as ISO strings, while YAML loads datetime objects.
    if isinstance(value, dict):
        return {key: normalized(item) for key, item in value.items()}
    if isinstance(value, list):
        return [normalized(item) for item in value]
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    return value


soups = {}
for file in PUBLIC.rglob('*.html'):
    soups[file] = BeautifulSoup(file.read_text(), 'html.parser')

published = [post for post in REPORT['posts'] if not post['draft']]
drafts = [post for post in REPORT['posts'] if post['draft']]
source_files = sorted(p for p in (SOURCE / 'src/content/posts').rglob('*')
                      if p.suffix in ('.md', '.mdx') and not any(part.startswith('.') for part in p.relative_to(SOURCE).parts))
check(len(source_files) == len(REPORT['posts']), 'Source article count differs from manifest')
math_count = 0
for post in REPORT['posts']:
    source_file = SOURCE / post['source']
    target = REPO / 'site' / post['destination']
    check(digest(source_file) == post['sourceSha256'], f'Source changed: {source_file}')
    original, migrated = frontmatter(source_file), frontmatter(target)
    for key, value in original.items():
        check(normalized(migrated.get(key)) == normalized(value), f'Metadata changed: {target}: {key}')
    check(migrated['date'] == original['published'], f'Publication date changed: {target}')
    check(migrated['lastmod'] == (original['updated'] or original['published']), f'Updated date changed: {target}')
    check(migrated['show_toc'] == original['toc'], f'TOC setting changed: {target}')
    check(migrated['weight'] == (-original['pin'] if original['pin'] else 0), f'Pin order changed: {target}')
    output = PUBLIC / unquote(post['route']).lstrip('/') / 'index.html'
    check(output.exists() != post['draft'], f'Wrong publication status: {post["route"]}')
    if not output.exists():
        continue
    soup = soups[output]
    check(bool(soup.select_one('#TableOfContents')) == original['toc'], f'TOC output mismatch: {post["route"]}')
    main = soup.select_one('.main')
    rendered_math = len(main.select('.katex'))
    math_count += rendered_math
    check(rendered_math == post['mathExpressions'], f'Math expression count mismatch: {post["route"]}: source {post["mathExpressions"]}, rendered {rendered_math}')
    check(not main.select('.katex-error'), f'Formula render error: {post["route"]}')
    check(len(main.select('pre > code')) == post['codeBlocks'], f'Code block count mismatch: {post["route"]}')

for asset in REPORT['assets']:
    source_file = SOURCE / asset['source']
    target = REPO / 'site' / asset['destination']
    output = PUBLIC / Path(asset['destination']).relative_to('static')
    check(digest(source_file) == asset['sha256'], f'Source asset changed: {source_file}')
    check(target.exists() and digest(target) == asset['sha256'], f'Copied asset mismatch: {target}')
    check(output.exists() and digest(output) == asset['sha256'], f'Built asset mismatch: {output}')

missing_links, missing_fragments = [], []
checked_links = 0
for file, soup in soups.items():
    route = '/' + file.relative_to(PUBLIC).as_posix().removesuffix('index.html')
    for element in soup.select('[href], [src], [data]'):
        value = element.get('href') or element.get('src') or element.get('data')
        if not value:
            continue
        url = urlsplit(urljoin('https://languisher.github.io' + route, value))
        if url.netloc != 'languisher.github.io' or url.scheme not in ('http', 'https'):
            continue
        checked_links += 1
        target = PUBLIC / unquote(url.path).lstrip('/')
        if target.is_dir():
            target = target / 'index.html'
        if not target.exists():
            missing_links.append({'page': route, 'target': value})
        elif url.fragment and target in soups:
            fragment = unquote(url.fragment)
            if not soups[target].find(id=fragment) and not soups[target].find('a', attrs={'name': fragment}):
                missing_fragments.append({'page': route, 'target': value})

# Check locally hosted stylesheets' font/image references as well.
for file in PUBLIC.rglob('*.css'):
    for value in re.findall(r'url\([\'"]?([^\)\'"\s]+)', file.read_text()):
        if urlsplit(value).scheme or value.startswith('//'):
            continue
        target = PUBLIC / unquote(value).lstrip('/') if value.startswith('/') else file.parent / unquote(value)
        check(target.exists(), f'CSS resource missing: {file}: {value}')

check(not missing_links, f'{len(missing_links)} missing internal links')
check(not missing_fragments, f'{len(missing_fragments)} missing internal anchors')
archive_links = [a.get('href') for a in soups[PUBLIC / 'blog/index.html'].select('h2.toc-line a')]
check({unquote(url) for url in archive_links} == {post['route'] for post in published}, 'Article archive differs from published articles')
check(archive_links[:2] == ['/posts/llm-infra/', '/posts/llm-infra-infrastructure/'], 'Pinned article order changed')
search = json.loads((PUBLIC / 'index.json').read_text())
check(not ({post['route'] for post in drafts} & {page['uri'] for page in search}), 'Drafts leaked into search index')
draft_routes = {post['route'] for post in drafts}
for file in PUBLIC.rglob('*.xml'):
    if file.relative_to(PUBLIC).parts[0] in ('media', 'vendor'):
        continue
    for element in ET.parse(file).iter():
        if element.tag.rsplit('}', 1)[-1] in ('link', 'loc') and element.text:
            check(unquote(urlsplit(element.text.strip()).path) not in draft_routes, f'Draft leaked into feed or sitemap: {file}')

result = {
    'published': len(published), 'draftsExcluded': len(drafts), 'originalMetadataPreserved': len(REPORT['posts']),
    'assetsVerified': len(REPORT['assets']), 'assetBytes': REPORT['summary']['assetBytes'],
    'renderedMath': math_count, 'internalLinksChecked': checked_links,
    'missingLinks': missing_links, 'missingFragments': missing_fragments, 'errors': errors,
}
(REPO / 'migration-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
sys.exit(bool(errors))
