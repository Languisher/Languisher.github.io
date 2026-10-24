---
title: 搜索
menu:
  main:
    name: 搜索
    weight: 60
---

输入关键词搜索文章。空格表示同时包含多个关键词，`|` 表示匹配任意关键词，英文双引号表示匹配完整短语。

<style type="text/css">
.main {
  width: 100%;
}
#search-input {
  width: 100%;
  font-size: 1.2em;
  padding: .5em;
}
.search-results b {
  background-color: yellow;
}
.search-preview {
  margin-left: 2em;
}
.single .main a, .single .main h2 {
  border-bottom: none;
}
</style>

<input type="search" id="search-input" aria-label="搜索文章">

<div class="search-results">
<section>
<h2 class="toc-line"><a target="_blank"></a><span class="dots"></span><span class="page-num small"></span></h2>
<div class="search-preview"></div>
</section>
</div>

<script src="https://cdn.jsdelivr.net/npm/fuse.js@6.6.2" defer></script>
<script src="https://cdn.jsdelivr.net/npm/@xiee/utils/js/fuse-search.min.js" defer></script>
