/* ============================================================
   app.js — Renders release content into .content area.

   Called after config-loader.js has populated window.__cfg
   and sidebar is built.

   Public functions used by other modules:
     renderRelease(tag, data)   — called by sidebar button click
     rerenderCurrentLang(lang)  — called by lang.js on language switch
   ============================================================ */

/* Track what's currently displayed */
let _currentTag  = null;
let _currentData = null;

/* ── Auto-render first release once config is ready ── */
(function waitForCfg() {
  const cfg = window.__cfg;
  if (!cfg) { requestAnimationFrame(waitForCfg); return; }

  const entries = Object.entries(cfg.releases || {});
  if (!entries.length) {
    showEmpty();
    return;
  }

  /* Apply saved lang preference to buttons now that DOM is ready */
  const lang = window.getCurrentLang?.() || 'ru';
  syncLangButtons(lang);

  /* Render version from URL hash, fallback to first (newest) */
  const hashTag = decodeURIComponent(location.hash.slice(1));
  const target = hashTag && cfg.releases[hashTag]
    ? [hashTag, cfg.releases[hashTag]]
    : entries[0];

  renderRelease(target[0], target[1]);
})();

/* ── Handle browser back/forward navigation ── */
window.addEventListener('popstate', () => {
  const cfg = window.__cfg;
  if (!cfg) return;
  const hashTag = decodeURIComponent(location.hash.slice(1));
  if (hashTag && cfg.releases[hashTag]) {
    renderRelease(hashTag, cfg.releases[hashTag]);
    activateSidebarItem(hashTag);
  }
});


/* ════════════════════════════════════════════════════════════
   RENDER RELEASE
   ════════════════════════════════════════════════════════════ */
function renderRelease(tag, data) {
  _currentTag  = tag;
  _currentData = data;

  /* Update URL hash without pushing a new history entry on initial load,
     but DO push when the user explicitly clicks a sidebar item. */
  const encoded = encodeURIComponent(tag);
  if (location.hash !== '#' + encoded) {
    history.pushState(null, '', '#' + encoded);
  }

  const lang     = window.getCurrentLang?.() || 'ru';
  const sections = data[lang] || data.ru || [];

  const content = document.getElementById('release-content');
  if (!content) return;

  content.innerHTML = '';

  /* ── Header ── */
  const header = buildHeader(tag, data);
  content.appendChild(header);

  /* ── Rule ── */
  const rule = document.createElement('div');
  rule.className = 'release-rule';
  content.appendChild(rule);

  /* ── Body ── */
  const body = document.createElement('div');
  body.className = 'release-body';

  if (!sections.length) {
    body.appendChild(buildEmpty());
  } else {
    sections.forEach(sec => body.appendChild(buildSection(sec)));
  }

  content.appendChild(body);

  /* Update page title */
  document.title = `${tag} — ${window.__cfg?.site?.project || 'Changelog'}`;

  /* Scroll content to top */
  document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'smooth' });
}


/* ── Re-render current release in new language (called by lang.js) ── */
function rerenderCurrentLang(lang) {
  if (!_currentTag || !_currentData) return;

  const sections = _currentData[lang] || _currentData.ru || [];
  const body = document.querySelector('.release-body');
  if (!body) return;

  /* Fade body out, swap, fade in */
  body.style.opacity = '0';
  body.style.transition = 'opacity 0.18s ease';

  setTimeout(() => {
    body.innerHTML = '';
    if (!sections.length) {
      body.appendChild(buildEmpty());
    } else {
      sections.forEach(sec => body.appendChild(buildSection(sec)));
    }
    body.style.opacity = '1';
  }, 180);
}


/* ════════════════════════════════════════════════════════════
   BUILDERS
   ════════════════════════════════════════════════════════════ */

function buildHeader(tag, data) {
  const wrap = document.createElement('div');
  wrap.className = 'release-header reveal' + (data.major ? ' release-header--major' : '');

  /* Version number — split at "v" for accent colouring */
  const h1 = document.createElement('h1');
  h1.className = 'release-version-tag';
  const match = tag.match(/^(v?)(.+)$/);
  if (match) {
    h1.innerHTML = `<span>${escHtml(match[1])}</span>${escHtml(match[2])}`;
  } else {
    h1.textContent = tag;
  }
  wrap.appendChild(h1);

  /* Date */
  if (data.date) {
    const meta = document.createElement('div');
    meta.className = 'release-meta';

    const dateSpan = document.createElement('span');
    dateSpan.className = 'release-date';
    dateSpan.textContent = formatDateLong(data.date);
    meta.appendChild(dateSpan);

    wrap.appendChild(meta);
  }

  return wrap;
}

function buildSection(sec) {
  const wrap = document.createElement('div');
  wrap.className = 'release-section';
  wrap.dataset.type = sec.type || 'new';

  /* Head */
  const head = document.createElement('div');
  head.className = 'section-head';

  const badge = document.createElement('span');
  badge.className = `badge badge-${sec.type || 'new'}`;
  badge.innerHTML = BADGE_ICONS[sec.type || 'new'] + escHtml(BADGE_LABELS[sec.type || 'new'] || sec.type || 'new');
  head.appendChild(badge);

  const title = document.createElement('span');
  title.className = 'section-title';
  title.innerHTML = renderInlineCode(sec.title || '');
  head.appendChild(title);

  wrap.appendChild(head);

  /* Items */
  if (Array.isArray(sec.items) && sec.items.length) {
    const ul = document.createElement('ul');
    ul.className = 'section-items';

    sec.items.forEach(text => {
      const li = document.createElement('li');
      li.className = 'section-item';
      li.innerHTML = `<span class="section-item-text">${renderInlineCode(text)}</span>`;
      ul.appendChild(li);
    });

    wrap.appendChild(ul);
  }

  return wrap;
}

function buildEmpty() {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0120 9.414V19a2 2 0 01-2 2z"/>
    </svg>
    <span>No entries for this version.</span>
  `;
  return div;
}

function showEmpty() {
  const content = document.getElementById('release-content');
  if (content) content.appendChild(buildEmpty());
}


/* ════════════════════════════════════════════════════════════
   INLINE CODE  — wrap `backtick` spans with <code>
   ════════════════════════════════════════════════════════════ */
function renderInlineCode(text) {
  return escHtml(text).replace(
    /`([^`]+)`/g,
    (_, inner) => `<code>${inner}</code>`
  );
}


/* ════════════════════════════════════════════════════════════
   BADGE LABELS / ICONS
   ════════════════════════════════════════════════════════════ */
const BADGE_LABELS = {
  new:     'New',
  changed: 'Changed',
  fixed:   'Fixed',
  removed: 'Removed',
};

const BADGE_ICONS = {
  new:     `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><path d="M12 5v14M5 12h14"/></svg>`,
  changed: `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><path d="M4 4v5h5M20 20v-5h-5"/><path d="M4 9a9 9 0 0114.09-2.09M20 15a9 9 0 01-14.09 2.09"/></svg>`,
  fixed:   `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>`,
  removed: `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><path d="M5 12h14"/></svg>`,
};


/* ════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════ */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateLong(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch { return iso; }
}

function syncLangButtons(lang) {
  document.getElementById('btn-ru')?.classList.toggle('active', lang === 'ru');
  document.getElementById('btn-en')?.classList.toggle('active', lang === 'en');
}

function activateSidebarItem(tag) {
  document.querySelectorAll('.version-item').forEach(el => {
    el.classList.toggle('active', el.dataset.version === tag);
  });
}
