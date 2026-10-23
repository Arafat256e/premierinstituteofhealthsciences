/* Public website behaviour: responsive navigation, Supabase forms, editable page copy, and published content. */
(() => {
  const configured = () => window.SUPABASE_URL && !window.SUPABASE_URL.includes('YOUR_PROJECT_ID') && window.SUPABASE_ANON_KEY && !window.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
  window.sb = configured() && window.supabase ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;
  window.$ = (selector, root = document) => root.querySelector(selector);
  window.esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  window.setStatus = (el, message, error = false) => { if (el) { el.textContent = message; el.classList.toggle('status-error', !!error); el.classList.toggle('status-success', !error); } };

  window.SITE_SETTINGS = {};
  document.addEventListener('DOMContentLoaded', async () => {
    const toggle = $('.nav-toggle'), links = $('.nav-links');
    if (toggle && links) toggle.addEventListener('click', () => { const open = links.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); });
    const year = $('[data-year]'); if (year) year.textContent = new Date().getFullYear();
    document.querySelectorAll('.nav-links a').forEach(link => { if (link.pathname.split('/').pop() === (location.pathname.split('/').pop() || 'index.html')) link.classList.add('active'); });
    document.querySelectorAll('form[data-table]').forEach(form => form.addEventListener('submit', submitPublicForm));
    await loadPageContent();
    await loadPublicContent();
  });

  async function loadPageContent() {
    const defaults = window.PAGE_CONTENT_DEFAULTS || {};
    const pageKey = document.body.dataset.pageKey;
    const wanted = [...new Set([pageKey, 'site'].filter(Boolean))];
    let contentByKey = {};
    if (window.sb) {
      try {
        const { data, error } = await window.sb.from('page_content').select('page_key,content').in('page_key', wanted);
        if (!error && data) data.forEach(row => { contentByKey[row.page_key] = row.content || {}; });
      } catch (_) { /* Local fallback remains available while Supabase is offline. */ }
    }
    for (const key of wanted) {
      const merged = { ...(defaults[key] || {}), ...(contentByKey[key] || {}) };
      document.querySelectorAll(`[data-content-page="${key}"]`).forEach(el => { const val = merged[el.dataset.content]; if (typeof val === 'string') el.textContent = val; });
      if (key === pageKey) {
        document.querySelectorAll('[data-content]').forEach(el => { const val = merged[el.dataset.content]; if (typeof val === 'string') el.textContent = val; });
        const siteName = contentByKey.site?.school_name || defaults.site?.school_name || 'Premier Institute of Health Sciences Ltd';
        if (merged.page_title) document.title = merged.page_title.replace(/Premier Institute of Health Sciences Ltd/g, siteName);
        if (merged.meta_description) { let meta = document.querySelector('meta[name="description"]'); if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); } meta.content = merged.meta_description; }
      }
      if (key === 'site') {
        window.SITE_SETTINGS = merged;
        document.querySelectorAll('[data-site-content]').forEach(el => { const val = merged[el.dataset.siteContent]; if (typeof val === 'string') el.textContent = val; });
        const logoUrl = merged.logo_url || 'assets/school-logo.png';
        const hero = document.querySelector('.hero');
        if (hero && merged.hero_image_url) {
          const safeHeroUrl = String(merged.hero_image_url).replace(/[\"\\]/g, '');
          hero.style.backgroundImage = `linear-gradient(105deg,rgba(4,58,79,.97) 0%,rgba(7,91,124,.82) 58%,rgba(7,91,124,.38) 100%),url("${safeHeroUrl}")`;
          hero.style.backgroundSize = 'cover'; hero.style.backgroundPosition = 'center 38%';
        }

        document.querySelectorAll('[data-brand-logo], .brand-logo').forEach(img => { img.src = logoUrl; img.onerror = () => { img.onerror = null; img.src = 'assets/school-logo.png'; }; });
        document.querySelectorAll('[data-site-icon]').forEach(el => applyIcon(el, merged[el.dataset.siteIcon]));
      }
    }
  }

  function applyIcon(element, value) {
    if (!element || !value) return;
    const text = String(value).trim();
    if (/^(https?:\/\/|assets\/)/i.test(text)) { element.innerHTML = `<img src="${esc(text)}" alt="" loading="lazy">`; element.classList.add('custom-icon-image'); }
    else { element.textContent = text; element.classList.remove('custom-icon-image'); }
  }

  async function submitPublicForm(event) {
    event.preventDefault();
    const form = event.currentTarget, status = $('[data-form-status]', form), table = form.dataset.table;
    if (!window.sb) { setStatus(status, 'The form is not connected yet. The website administrator must add the Supabase URL and public key in js/supabase-config.js.', true); return; }
    const allowed = ['admissions', 'contact_inquiries', 'career_applications', 'student_requests'];
    if (!allowed.includes(table)) { setStatus(status, 'This form is not configured.', true); return; }
    const payload = {};
    const honeypot = form.elements.namedItem('website');
    new FormData(form).forEach((value, key) => { if (typeof value === 'string' && key !== 'website') payload[key] = value.trim(); });
    if (honeypot && honeypot.value.trim()) { setStatus(status, 'Thank you. Your submission has been received.'); form.reset(); return; }
    const button = form.querySelector('[type="submit"]'); if (button) { button.disabled = true; button.dataset.originalText = button.textContent; button.textContent = 'Sending…'; }
    try {
      const { error } = await window.sb.from(table).insert(payload);
      if (error) throw error;
      form.reset(); setStatus(status, 'Thank you. Your submission has been received. The school team can follow up using the contact details you provided.');
    } catch (error) { setStatus(status, `We could not submit this form. ${error.message || 'Please try again later.'}`, true); }
    finally { if (button) { button.disabled = false; button.textContent = button.dataset.originalText || 'Submit'; } }
  }

  async function loadPublicContent() {
    if (!window.sb) return;
    const jobs = [];
    if ($('[data-programs]')) jobs.push(loadRows('programs', 'id,title,award,duration,description,requirements', 'sort_order', '[data-programs]', renderPrograms));
    if ($('[data-publications]')) jobs.push(loadRows('publications', 'id,title,category,summary,file_url,published_at', 'published_at', '[data-publications]', renderPublications, true));
    if ($('[data-careers]')) jobs.push(loadRows('career_opportunities', 'id,title,department,location,employment_type,description,deadline,apply_url', 'created_at', '[data-careers]', renderCareers, true));
    if ($('[data-announcements]')) jobs.push(loadRows('announcements', 'id,title,body,published_at', 'published_at', '[data-announcements]', renderAnnouncements, true, 8));
    if ($('[data-gallery]')) jobs.push(loadRows('gallery_items', 'id,title,image_url,alt_text,caption,sort_order', 'sort_order', '[data-gallery]', renderGallery));
    await Promise.all(jobs);
  }

  async function loadRows(table, columns, order, selector, renderer, descending = false, limit = 50) {
    const target = $(selector); if (!target) return;
    try {
      let query = window.sb.from(table).select(columns).eq('is_published', true).order(order, { ascending: !descending, nullsFirst: false }).limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      if (data && data.length) { target.innerHTML = renderer(data); target.querySelectorAll('.card-icon').forEach(el => { if (/^(https?:\/\/|assets\/)/i.test(el.textContent.trim())) applyIcon(el, el.textContent.trim()); }); }
    } catch (error) { console.warn(`Could not load ${table}:`, error.message); }
  }
  function renderPrograms(rows) { return rows.map(x => `<article class="card"><div class="card-icon" aria-hidden="true">${esc(window.SITE_SETTINGS.icon_programs || '⚕️')}</div><span class="pill">${esc(x.award || 'Nursing programme')}</span><h3>${esc(x.title)}</h3><p>${esc(x.description || '')}</p><p><strong>Duration:</strong> ${esc(x.duration || 'Contact admissions')}</p><p><strong>Entry guidance:</strong> ${esc(x.requirements || 'Contact admissions for current requirements.')}</p></article>`).join(''); }
  function renderPublications(rows) { return rows.map(x => `<article class="listing-item"><div><span class="pill">${esc(x.category || 'Publication')}</span><h3>${esc(x.title)}</h3><p>${esc(x.summary || '')}</p>${x.published_at ? `<small class="muted">${esc(x.published_at)}</small>` : ''}</div>${safeLink(x.file_url, 'Open resource ↗')}</article>`).join(''); }
  function renderCareers(rows) { return rows.map(x => `<article class="listing-item"><div><span class="pill">${esc(x.employment_type || 'Opportunity')}</span><h3>${esc(x.title)}</h3><p><strong>${esc(x.department || '')}</strong>${x.location ? ` · ${esc(x.location)}` : ''}</p><p>${esc(x.description || '')}</p><p><strong>Deadline:</strong> ${esc(x.deadline || 'Not specified')}</p></div>${safeLink(x.apply_url, 'Apply ↗')}</article>`).join(''); }
  function renderAnnouncements(rows) { return rows.map(x => `<article class="listing-item"><div><h3>${esc(x.title)}</h3><p>${esc(x.body || '')}</p></div><span class="muted">${esc(x.published_at || '')}</span></article>`).join(''); }
  function renderGallery(rows) { return rows.map(x => `<article class="gallery-card"><img src="${esc(x.image_url)}" alt="${esc(x.alt_text || x.title || 'School activity')}" loading="lazy"><div><h3>${esc(x.title || 'School life')}</h3><p>${esc(x.caption || '')}</p></div></article>`).join(''); }
  function safeLink(url, label) { if (!url) return ''; try { const parsed = new URL(url, location.href); if (!['http:', 'https:'].includes(parsed.protocol)) return ''; return `<a class="btn btn-outline" href="${esc(parsed.href)}" target="_blank" rel="noopener noreferrer">${label}</a>`; } catch (_) { return ''; } }
})();
