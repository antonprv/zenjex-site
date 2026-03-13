/* ============================================================
   config-loader.js — Loads config.json, fetches all release
   files from versioned subfolders, and bootstraps the site.

   Folder structure:
     releases/
       index.json          ← { "versions": ["v3", "v2", "v1"] }
       v3/
         index.json        ← { "files": ["v3.0.0.json", "v3.2.0.json"] }
         v3.0.0.json       ← { "version", "date", "major": true, "ru", "en" }
         v3.2.0.json
       v2/ ...
       v1/ ...

   Sorting: by semver descending within each major group.
   Major releases (major: true) get special visual treatment.
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

  /* ── 2. Load releases ── */
  const releasesDir = cfg.releasesDir || 'releases';
  let releaseGroups = [];

  try {
    releaseGroups = await loadReleaseGroups(releasesDir);
  } catch (err) {
    console.error('[config-loader] Failed to load releases:', err);
  }

  /* Flat map for app.js compatibility: { [version]: data } */
  const releases = {};
  releaseGroups.forEach(group => {
    group.releases.forEach(r => { releases[r.version] = r; });
  });

  cfg.releases      = releases;
  cfg.releaseGroups = releaseGroups;
  window.__cfg      = cfg;

  renderSidebar(releaseGroups);

})();


/* ════════════════════════════════════════════════════════════
   RELEASE LOADER
   Reads root index → for each version folder reads its index
   → fetches all release files in parallel → sorts by semver
   ════════════════════════════════════════════════════════════ */
async function loadReleaseGroups(dir) {
  const rootRes = await fetch(`${dir}/index.json`);
  if (!rootRes.ok) throw new Error(`Cannot load ${dir}/index.json — HTTP ${rootRes.status}`);
  const rootIndex = await rootRes.json();

  const versionFolders = Array.isArray(rootIndex.versions) ? rootIndex.versions : [];

  /* Load each version group in parallel */
  const groupResults = await Promise.allSettled(
    versionFolders.map(folder => loadVersionGroup(dir, folder))
  );

  const groups = [];
  groupResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      groups.push(r.value);
    } else {
      console.warn(`[config-loader] Skipped folder ${versionFolders[i]}:`, r.reason);
    }
  });

  /* Sort groups by their highest version descending */
  groups.sort((a, b) => compareSemver(b.majorVersion, a.majorVersion));

  return groups;
}

async function loadVersionGroup(dir, folder) {
  const idxRes = await fetch(`${dir}/${folder}/index.json`);
  if (!idxRes.ok) throw new Error(`Cannot load ${dir}/${folder}/index.json — HTTP ${idxRes.status}`);
  const idx = await idxRes.json();

  const files = Array.isArray(idx.files) ? idx.files : [];

  const results = await Promise.allSettled(
    files.map(async filename => {
      const res = await fetch(`${dir}/${folder}/${filename}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${filename}`);
      return res.json();
    })
  );

  const releases = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') releases.push(r.value);
    else console.warn(`[config-loader] Skipped ${folder}/${files[i]}:`, r.reason);
  });

  /* Sort releases within group by semver descending */
  releases.sort((a, b) => compareSemver(b.version, a.version));

  /* Major version tag = first segment e.g. "v3" */
  const majorVersion = folder;

  return { majorVersion, releases };
}


/* ════════════════════════════════════════════════════════════
   SEMVER
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
   SIDEBAR — grouped by major version
   ════════════════════════════════════════════════════════════ */
function renderSidebar(groups = []) {
  const list = document.getElementById('version-list');
  if (!list) return;
  list.innerHTML = '';

  let firstItem = true;
  const hashTag = decodeURIComponent(location.hash.slice(1));

  groups.forEach(group => {
    /* ── Major version group header ── */
    const groupEl = document.createElement('li');
    groupEl.className = 'version-group';

    const groupLabel = document.createElement('div');
    groupLabel.className = 'version-group-label';
    groupLabel.textContent = group.majorVersion.toUpperCase();
    groupEl.appendChild(groupLabel);

    /* ── Releases within group ── */
    const subList = document.createElement('ul');
    subList.className = 'version-sublist';

    group.releases.forEach(data => {
      const tag = data.version;
      const isMajor = !!data.major;

      const li = document.createElement('li');
      const isActive = hashTag ? tag === hashTag : firstItem;
      li.className = 'version-item' +
        (isMajor   ? ' version-item--major' : '') +
        (isActive  ? ' active' : '');
      li.dataset.version = tag;

      const btn = document.createElement('button');
      btn.className = 'version-btn';
      btn.setAttribute('aria-label', `Version ${tag}`);

      if (isMajor) {
        btn.innerHTML = `
          <span class="version-btn-tag">
            <span class="version-btn-major-dot"></span>
            ${escHtml(tag)}
          </span>
          <span class="version-btn-date">${formatDate(data.date)}</span>
        `;
      } else {
        btn.innerHTML = `
          <span class="version-btn-tag">${escHtml(tag)}</span>
          <span class="version-btn-date">${formatDate(data.date)}</span>
        `;
      }

      btn.addEventListener('click', () => {
        document.querySelectorAll('.version-item').forEach(el => el.classList.remove('active'));
        li.classList.add('active');
        if (typeof renderRelease === 'function') renderRelease(tag, data);
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebar-backdrop')?.classList.remove('open');
      });

      li.appendChild(btn);
      subList.appendChild(li);
      firstItem = false;
    });

    groupEl.appendChild(subList);
    list.appendChild(groupEl);
  });
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
