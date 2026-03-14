/* ============================================================
   docs.js — mirrors app.js exactly.
   Polls window.__cfg, then fetches HTML fragments and injects
   them into #doc-content. No markdown parsing, no JS rendering.
   ============================================================ */

let _currentPage = null;

(function waitForCfg() {
  const cfg = window.__cfg;
  if (!cfg) { setTimeout(waitForCfg, 30); return; }

  const groups = cfg.docGroups || [];
  if (!groups.length) { setTimeout(waitForCfg, 30); return; }

  const lang = window.getCurrentLang?.() || 'ru';
  syncLangButtons(lang);

  window.addEventListener('popstate', () => {
    const id   = decodeURIComponent(location.hash.slice(1));
    const page = window.__cfg?.docPages?.[id];
    if (page) { renderDocPage(page); activateSidebarItem(id); }
  });

  const hashId = decodeURIComponent(location.hash.slice(1));
  const first  = groups[0]?.pages[0];
  const target = (hashId && cfg.docPages?.[hashId]) || first;
  if (target) renderDocPage(target);
}());


/* ════════════════════════════════════════════════════════════
   RENDER — fetch HTML fragment, inject into DOM
   ════════════════════════════════════════════════════════════ */
async function renderDocPage(page) {
  _currentPage = page;

  const lang    = window.getCurrentLang?.() || 'ru';
  const encoded = encodeURIComponent(page.id);
  if (location.hash !== '#' + encoded) history.pushState(null, '', '#' + encoded);

  document.title = `${lang === 'ru' ? page.titleRu : page.titleEn} — ${window.__cfg?.site?.project || 'Docs'}`;

  const content = document.getElementById('doc-content');
  if (!content) return;

  content.innerHTML = '';

  /* Fetch and inject the HTML fragment */
  const docsDir = window.__cfg?.docsDir || 'docs';
  const url     = `${docsDir}/${page._cat}/${page.id}.html`;

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();

    const wrap = document.createElement('div');
    wrap.className = 'doc-fragment';
    wrap.innerHTML = html;
    content.appendChild(wrap);

    /* Apply current language */
    applyLang(wrap, lang);

    /* Syntax highlight all C# code blocks */
    wrap.querySelectorAll('code.language-csharp').forEach(highlightCsharp);

  } catch (e) {
    console.error('[docs] fetch fragment:', e);
    const err = document.createElement('div');
    err.className = 'empty-state';
    err.textContent = `Could not load ${url}: ${e.message}`;
    content.appendChild(err);
  }

  /* Prev/next nav */
  const nav = buildNav(page);
  if (nav) content.appendChild(nav);

  content.scrollTo({ top: 0, behavior: 'smooth' });
}


/* ── Apply language: show ru or en body block ── */
function applyLang(container, lang) {
  const ru = container.querySelector('#doc-body-ru');
  const en = container.querySelector('#doc-body-en');
  if (ru) ru.style.display = lang === 'ru' ? '' : 'none';
  if (en) en.style.display = lang === 'en' ? '' : 'none';
}


/* ── Re-render on language switch (called by lang.js) ── */
function rerenderCurrentLang(lang) {
  syncLangButtons(lang);

  document.querySelectorAll('#doc-list .t').forEach(el => {
    const v = el.getAttribute('data-' + lang);
    if (v !== null) el.textContent = v;
  });

  if (!_currentPage) return;

  /* Swap body blocks */
  const wrap = document.querySelector('.doc-fragment');
  if (wrap) applyLang(wrap, lang);
}


/* ── Prev / Next navigation ── */
function buildNav(page) {
  const groups   = window.__cfg?.docGroups || [];
  const allPages = groups.flatMap(g => g.pages);
  const idx      = allPages.findIndex(p => p.id === page.id);
  if (idx < 0) return null;

  const prev = allPages[idx - 1] || null;
  const next = allPages[idx + 1] || null;
  if (!prev && !next) return null;

  const nav = document.createElement('div');
  nav.className = 'doc-page-nav';

  const lang = window.getCurrentLang?.() || 'ru';

  const makeLink = (p, labelRu, labelEn, alignRight) => {
    if (!p) return null;
    const btn = document.createElement('button');
    btn.className = 'doc-nav-link' + (alignRight ? ' doc-nav-link--next' : '');
    const label = document.createElement('span');
    label.className = 't';
    label.setAttribute('data-ru', labelRu);
    label.setAttribute('data-en', labelEn);
    label.textContent = labelRu;
    const title = document.createElement('span');
    title.className = 'doc-nav-title';
    title.textContent = lang === 'ru' ? p.titleRu : p.titleEn;
    btn.appendChild(label);
    btn.appendChild(title);
    btn.addEventListener('click', () => { activateSidebarItem(p.id); renderDocPage(p); });
    return btn;
  };

  const prevBtn = makeLink(prev, '← Назад',  '← Previous', false);
  const nextBtn = makeLink(next, 'Далее →',  'Next →',     true);
  if (prevBtn) nav.appendChild(prevBtn);
  if (nextBtn) nav.appendChild(nextBtn);
  return nav;
}


/* ── Helpers ── */
function activateSidebarItem(id) {
  document.querySelectorAll('.doc-page-item').forEach(el => {
    el.classList.toggle('active', el.dataset.pageId === id);
  });
}
function syncLangButtons(lang) {
  document.getElementById('btn-ru')?.classList.toggle('active', lang === 'ru');
  document.getElementById('btn-en')?.classList.toggle('active', lang === 'en');
}


/* ════════════════════════════════════════════════════════════
   C# SYNTAX HIGHLIGHTER
   Called on <code class="language-csharp"> elements after
   fragment injection. Text is already HTML-escaped.
   ════════════════════════════════════════════════════════════ */
function highlightCsharp(block) {
  var s = block.innerHTML;

  /* 1. String literals */
  s = s.replace(/(&quot;(?:[^&]|&(?!quot;))*&quot;)/g,
      '<span class="hl-s">$1</span>');

  /* 2. Line comments  //...  (avoid matching URLs by checking no colon before) */
  s = s.replace(/((?:^|[^:]))(\/\/[^\n]*)/gm,
      '$1<span class="hl-c">$2</span>');

  /* 3. Keywords — only outside existing spans */
  var KW = 'public|private|protected|internal|static|abstract|override|virtual|sealed|readonly|const|new|class|interface|namespace|using|return|void|bool|int|float|double|string|var|null|true|false|this|base|typeof|if|else|for|foreach|while|yield|async|await|get|set|in|out|ref|params|where|event|delegate|partial|struct|enum|operator|is|as|try|catch|finally|throw|switch|case|break|continue';
  s = s.replace(new RegExp('\\b(' + KW + ')\\b', 'g'), function(m, kw) {
    return '<span class="hl-k">' + kw + '</span>';
  });

  /* 4. PascalCase type names */
  s = s.replace(/\b([A-Z][A-Za-z0-9_]*)\b/g, function(m, t) {
    return '<span class="hl-t">' + t + '</span>';
  });

  /* 5. Attributes  [Something] */
  s = s.replace(/(\[[A-Za-z][A-Za-z0-9_, ]*\])/g, function(m, a) {
    return '<span class="hl-a">' + a + '</span>';
  });

  block.innerHTML = s;
}
