/* ============================================================
   config-loader.js — Loads config.json, fetches release files
                      from releasesDir, and bootstraps the site.

   Load order (index.html):
     theme.js → config-loader.js → lang.js → app.js → scroll.js

   Steps:
     1. Fetch config.json
     2. Apply accent colours
     3. Apply noise texture
     4. Inject custom font
     5. Patch page meta (title, topbar)
     6. Load all release .json files from releasesDir
     7. Sort releases by semver (newest first)
     8. Hand off to app.js via window.__cfg
   ============================================================ */

(async function bootstrap() {

  /* ── 1. Load config.json ── */
  let cfg;
  try {
    const res = await fetch('config.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cfg = await res.json();
  } catch (err) {
    console.error('[config-loader] Failed to load config.json:', err);
    return;
  }

  applyAccentColors(cfg.theme);
  applyNoise(cfg.noise);
  if (cfg.font?.files?.length || cfg.font?.path) injectFont(cfg.font);
  patchMeta(cfg.site);

  /* ── 2. Load releases from releasesDir ── */
  const releasesDir = cfg.releasesDir || 'releases';
  let releases = {};

  try {
    releases = await loadReleases(releasesDir);
  } catch (err) {
    console.error('[config-loader] Failed to load releases:', err);
  }

  cfg.releases = releases;
  window.__cfg  = cfg;

  renderSidebar(releases);

})();


/* ════════════════════════════════════════════════════════════
   RELEASE LOADER
   Fetches an index file listing all release filenames, then
   loads each .json in parallel, and sorts by semver descending.

   Convention: releasesDir/index.json contains { "files": ["v3.2.0.json", ...] }
   ════════════════════════════════════════════════════════════ */
async function loadReleases(dir) {
  /* Fetch the index listing */
  const indexRes = await fetch(`${dir}/index.json`);
  if (!indexRes.ok) throw new Error(`Cannot load ${dir}/index.json — HTTP ${indexRes.status}`);
  const index = await indexRes.json();

  if (!Array.isArray(index.files) || !index.files.length) {
    console.warn('[config-loader] releases index is empty or malformed');
    return {};
  }

  /* Fetch all release files in parallel */
  const results = await Promise.allSettled(
    index.files.map(async filename => {
      const res = await fetch(`${dir}/${filename}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${filename}`);
      return res.json();
    })
  );

  /* Collect successful results, warn on failures */
  const releases = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      releases.push(result.value);
    } else {
      console.warn(`[config-loader] Skipped ${index.files[i]}:`, result.reason);
    }
  });

  /* Sort by semver descending (newest first) */
  releases.sort((a, b) => compareSemver(b.version, a.version));

  /* Convert array → ordered object keyed by version tag */
  const ordered = {};
  releases.forEach(r => { ordered[r.version] = r; });
  return ordered;
}


/* ════════════════════════════════════════════════════════════
   SEMVER COMPARATOR
   Parses "v1.2.3" or "1.2.3" → [major, minor, patch]
   Returns negative / 0 / positive like Array.sort expects.
   ════════════════════════════════════════════════════════════ */
function parseSemver(v) {
  const clean = String(v).replace(/^v/i, '');
  const parts = clean.split('.').map(n => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts;
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}


/* ════════════════════════════════════════════════════════════
   ACCENT COLORS
   ════════════════════════════════════════════════════════════ */
function applyAccentColors({ accentDark, accentLight } = {}) {
  const root = document.documentElement.style;

  if (accentDark)  root.setProperty('--accent-dark',  accentDark);
  if (accentLight) root.setProperty('--accent-light', accentLight);

  const dark  = accentDark  || getComputedStyle(document.documentElement).getPropertyValue('--accent-dark').trim();
  const light = accentLight || getComputedStyle(document.documentElement).getPropertyValue('--accent-light').trim();

  if (dark) {
    root.setProperty('--border-dark',       hexToRgba(dark, 0.18));
    root.setProperty('--glow-dark',         hexToRgba(dark, 0.12));
    root.setProperty('--gradient-top-dark', hexToRgba(dark, 0.15));
    root.setProperty('--gradient-bot-dark', hexToRgba(dark, 0.08));
  }
  if (light) {
    root.setProperty('--border-light',       hexToRgba(light, 0.25));
    root.setProperty('--glow-light',         hexToRgba(light, 0.15));
    root.setProperty('--gradient-top-light', hexToRgba(light, 0.18));
    root.setProperty('--gradient-bot-light', hexToRgba(light, 0.10));
  }
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


/* ════════════════════════════════════════════════════════════
   NOISE
   ════════════════════════════════════════════════════════════ */
function applyNoise({ frequency = 0.65, octaves = 1 } = {}) {
  const svg = [
    `<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'>`,
    `<filter id='n' color-interpolation-filters='linearRGB'>`,
    `<feTurbulence type='turbulence' baseFrequency='${frequency}' numOctaves='${octaves}' stitchTiles='stitch'/>`,
    `<feColorMatrix type='saturate' values='0'/>`,
    `</filter>`,
    `<rect width='100%' height='100%' filter='url(#n)' opacity='0.06'/>`,
    `</svg>`,
  ].join('');
  const encoded = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  document.documentElement.style.setProperty('--noise-svg', encoded);
}


/* ════════════════════════════════════════════════════════════
   FONT
   ════════════════════════════════════════════════════════════ */
function injectFont(fontCfg) {
  const { family, fallback } = fontCfg;
  const files = Array.isArray(fontCfg.files)
    ? fontCfg.files
    : [{ path: fontCfg.path, weight: fontCfg.weight, variable: fontCfg.variable }];

  const rules = files.map(f => buildFontFace(family, f)).join('\n');
  const style = document.createElement('style');
  style.textContent = rules;
  document.head.appendChild(style);
  document.body.style.fontFamily = `'${family}', ${fallback || 'sans-serif'}`;
}

function buildFontFace(family, { path, weight, variable }) {
  const isVar = variable !== undefined
    ? Boolean(variable)
    : /variable|-vf|[\s_\-]var[\s_.\\-]|VF\./i.test(path);

  const NAMES = {
    thin:100, hairline:100, extralight:200, light:300,
    regular:400, normal:400, medium:500,
    semibold:600, bold:700, extrabold:800, black:900,
  };

  let fw;
  if (weight !== undefined) {
    const raw = String(weight).trim().toLowerCase();
    fw = NAMES[raw] ?? (/^\d+$/.test(raw) ? raw : 'normal');
  } else {
    fw = isVar ? '100 900' : 'normal';
  }

  const fmt = isVar ? 'woff2-variations' : 'woff2';
  return `@font-face {
  font-family: '${family}';
  src: url('${path}') format('${fmt}');
  font-weight: ${fw};
  font-style: normal;
  font-display: swap;
}`;
}


/* ════════════════════════════════════════════════════════════
   META
   ════════════════════════════════════════════════════════════ */
function patchMeta(site = {}) {
  const nameEl = document.getElementById('topbar-project');
  if (nameEl && site.project) nameEl.textContent = site.project;

  const repoEl = document.getElementById('repo-link');
  if (repoEl) {
    if (site.repoUrl) repoEl.href = site.repoUrl;
    else              repoEl.style.display = 'none';
  }

  const backEl = document.getElementById('portfolio-link');
  if (backEl) {
    if (site.portfolioUrl) backEl.href = site.portfolioUrl;
    else                   backEl.style.display = 'none';
  }
}


/* ════════════════════════════════════════════════════════════
   SIDEBAR VERSION LIST
   ════════════════════════════════════════════════════════════ */
function renderSidebar(releases = {}) {
  const list = document.getElementById('version-list');
  if (!list) return;

  list.innerHTML = '';

  Object.entries(releases).forEach(([tag, data], i) => {
    const li = document.createElement('li');
    li.className = 'version-item' + (i === 0 ? ' active' : '');
    li.dataset.version = tag;

    const btn = document.createElement('button');
    btn.className = 'version-btn';
    btn.setAttribute('aria-label', `Version ${tag}`);
    btn.innerHTML = `
      <span class="version-btn-tag">${escHtml(tag)}</span>
      <span class="version-btn-date">${formatDate(data.date)}</span>
    `;

    btn.addEventListener('click', () => {
      document.querySelectorAll('.version-item').forEach(el => el.classList.remove('active'));
      li.classList.add('active');
      if (typeof renderRelease === 'function') renderRelease(tag, data);
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebar-backdrop')?.classList.remove('open');
    });

    li.appendChild(btn);
    list.appendChild(li);
  });
}


/* ── Helpers ── */
function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  } catch { return iso; }
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
