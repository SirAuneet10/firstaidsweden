/*!
 * First Aid Centre of Sweden, Bangladesh — Site admin panel
 * Plain script, no build, no dependencies.
 *
 * Contract with index.html:
 *  - index.html (URL hash "#admin") loads this file and calls window.FAAdmin.start().
 *    This file also auto-starts itself when location.hash === "#admin".
 *  - Live preview iframe: "./?preview=1". Messages sent to the iframe:
 *      {type:'fa:content', content}   (debounced ~400 ms after every edit, and on fa:ready)
 *      {type:'fa:scrollTo', target}   (section id, when a section editor opens)
 *    Message expected from the iframe: {type:'fa:ready'}
 *  - Published content: fetch('content.json', {cache:'no-store'})
 *
 * Storage:
 *  - localStorage  "fa-admin-cred"    {id, salt, hash, iterations}  (PBKDF2-SHA256, 210000 iterations)
 *  - sessionStorage "fa-admin-session" {id, at}
 *  - localStorage  "fa-admin-repo"    optional GitHub repository link (publish help)
 *  - IndexedDB "fa-admin" / store "kv" / key "draft"  {content, savedAt}
 */
(function () {
  'use strict';
  if (window.FAAdmin && window.FAAdmin.__loaded) return;

  /* ------------------------------------------------------------------ */
  /* Constants                                                           */
  /* ------------------------------------------------------------------ */
  var CRED_KEY = 'fa-admin-cred';
  var SESSION_KEY = 'fa-admin-session';
  var REPO_KEY = 'fa-admin-repo';
  var IDB_NAME = 'fa-admin';
  var IDB_STORE = 'kv';
  var DRAFT_KEY = 'draft';
  var ITERATIONS = 210000;
  var MB = 1024 * 1024;
  var WARN_BYTES = 5 * MB;
  var DANGER_BYTES = 15 * MB;
  var GITHUB_LIMIT = 25 * MB;

  var SECTION_ORDER = ['brand', 'hero', 'marquee', 'about', 'stats', 'training', 'modules', 'lab', 'equipment', 'gallery', 'team', 'compliance', 'enquiry', 'contact', 'emergency', 'footer', 'nav', 'seo', 'settings', 'meta'];
  var SECTIONS = {
    brand: { label: 'Brand & colours', icon: 'palette', desc: 'Name, logo and colours' },
    hero: { label: 'Top banner', icon: 'sparkle', desc: 'Big headline slides', list: 'slides' },
    marquee: { label: 'Client logos', icon: 'building', desc: 'Organisations you worked with', list: 'items' },
    about: { label: 'About us', icon: 'info', desc: 'Story, points, timeline, video', list: 'timeline' },
    stats: { label: 'Numbers', icon: 'chart', desc: 'Counters like “37+ years”', list: 'items' },
    training: { label: 'Training sectors', icon: 'cap', desc: 'The training areas', list: 'sectors' },
    modules: { label: 'Course modules', icon: 'book', desc: 'What learners learn', list: 'items' },
    lab: { label: 'First Aid Lab', icon: 'flask', desc: 'Interactive scenarios', list: 'scenes' },
    equipment: { label: 'Equipment', icon: 'kit', desc: 'AEDs and product lists', list: 'categories' },
    gallery: { label: 'Gallery', icon: 'image', desc: 'Photo albums', list: 'albums' },
    team: { label: 'Team', icon: 'users', desc: 'People and photos', list: 'members' },
    compliance: { label: 'Compliance banner', icon: 'shield', desc: 'Labour-law strip' },
    enquiry: { label: 'Enquiry form', icon: 'clipboard', desc: 'Google Form questions', list: 'googleForm.fields' },
    contact: { label: 'Contact', icon: 'phone', desc: 'Address, phones, socials', list: 'phones' },
    emergency: { label: 'Emergency', icon: 'siren', desc: '999 and quick steps', list: 'steps' },
    footer: { label: 'Footer', icon: 'layout', desc: 'Bottom of the page' },
    nav: { label: 'Menu', icon: 'menu', desc: 'Top navigation links' },
    seo: { label: 'Google & sharing', icon: 'globe', desc: 'Search title, share image' },
    settings: { label: 'Settings', icon: 'lock', desc: 'Google Drive API key' },
    meta: { label: 'File info', icon: 'tag', desc: 'Version (automatic)' }
  };
  var PREVIEW_IDS = ['hero', 'marquee', 'about', 'stats', 'training', 'modules', 'lab', 'equipment', 'gallery', 'team', 'enquiry', 'contact', 'footer'];
  var TARGET_IDS = ['hero', 'about', 'stats', 'training', 'modules', 'lab', 'equipment', 'gallery', 'team', 'enquiry', 'contact', 'footer', 'marquee'];
  var KNOWN_ICONS = ['heart', 'briefcase', 'helmet', 'shield', 'globe', 'stethoscope', 'trophy', 'plane', 'bandage', 'siren', 'kit'];

  var IMAGE_KEYS = { image: 1, thumb: 1, photo: 1, logo: 1, poster: 1, ogImage: 1 };
  var SMALL_IMAGE_KEYS = { logo: 1, thumb: 1 };
  var URL_KEYS = { url: 1, link: 1, video: 1, viewUrl: 1, actionUrl: 1, linkedin: 1 };
  var LONG_KEYS = { text: 1, bio: 1, summary: 1, description: 1, intro: 1, disclaimer: 1, successText: 1, topics: 1, audience: 1 };
  var ROW_KEYS = { steps: 1, points: 1 };

  var FORM_TYPES = [['text', 'Short text'], ['email', 'Email'], ['tel', 'Phone number'], ['date', 'Date'], ['textarea', 'Long text (paragraph)'], ['choice', 'Multiple choice']];

  var LABELS = {
    eyebrow: 'Small heading', subName: 'Second line of name', legalName: 'Legal name', ogImage: 'Share image',
    kicker: 'Slide label', emphasis: 'Highlighted words', primaryCta: 'Main button', secondaryCta: 'Second button',
    target: 'Scrolls to section', motherBranch: 'Mother company', mapQuery: 'Map search text', whatsapp: 'WhatsApp number',
    successTitle: 'Thank-you heading', successText: 'Thank-you message', googleForm: 'Google Form connection',
    viewUrl: 'Form link (public)', actionUrl: 'Form submit address', entry: 'Entry ID', thumb: 'Cover photo',
    images: 'Photos', photo: 'Photo', bio: 'Short bio', linkedin: 'LinkedIn link', ogImg: 'Share image',
    since: 'Counting from year', plain: 'Show as plain number', aed: 'AED section', copyright: 'Copyright name',
    id: 'Short code (ID)', url: 'Web address', link: 'Link', video: 'Video link', poster: 'Video cover image',
    keywords: 'Keywords', required: 'Required question', options: 'Answer choices', words: 'Scrolling words',
    hours: 'Opening hours', number: 'Number', socials: 'Social links', phones: 'Phone numbers', timeline: 'Timeline',
    points: 'Key points', topics: 'Topics covered', audience: 'Who it is for', models: 'AED models', scenes: 'Scenarios',
    trainer: 'CPR beat game', steps: 'Steps', tags: 'Tags', members: 'Team members', sectors: 'Sectors', albums: 'Albums',
    slides: 'Slides', fields: 'Form questions', colors: 'Colours', primary: 'Primary (royal blue)', accent: 'Accent (amber)',
    ink: 'Ink (text / dark)', paper: 'Paper (background)', emergency: 'Emergency red', suffix: 'After the number (e.g. +)',
    value: 'Number', label: 'Label', title: 'Title', text: 'Text', name: 'Name', role: 'Role', year: 'Year', type: 'Type',
    googleApiKey: 'Google Drive API key', driveSources: 'Google Drive folders', folder: 'Google Drive folder link',
    driveFolder: 'Google Drive folder (optional)',
    logo: 'Logo', image: 'Image', date: 'Date', summary: 'Short description', category: 'Category', icon: 'Icon', intro: 'Intro text'
  };
  var LABELS_BY_PATH = {
    'marquee.items': 'Client logos', 'stats.items': 'Numbers', 'modules.items': 'Modules', 'equipment.categories': 'Product categories',
    'equipment.categories.*.items': 'Products', 'gallery.categories': 'Album categories', 'about.video': 'Video',
    'emergency.number': 'Emergency phone number', 'contact.email': 'Email', 'nav': 'Menu links', 'brand.name': 'Organisation name',
    'enquiry.googleForm.fields.*.type': 'Answer type', 'enquiry.googleForm.fields.*.label': 'Question',
    'gallery.albums.*.logo': 'Company logo (optional)', 'gallery.albums.*.link': 'Link (optional)', 'gallery.albums.*.video': 'Video link (optional)',
    'gallery.albums.*.date': 'Date (optional)', 'seo.url': 'Website address', 'seo.title': 'Title in Google', 'seo.description': 'Description in Google',
    'equipment.aed.models.*.type': 'Type', 'gallery.driveSources.*.title': 'Title (optional)'
  };
  var HINTS = {
    eyebrow: 'The small text shown above the heading.',
    emphasis: 'Shown in the accent colour right after the title.',
    ogImage: 'Shown when the site is shared on Facebook, WhatsApp, LinkedIn. Best size 1200 × 630.',
    target: 'Which part of the page the button jumps to.',
    since: 'Founding year. Leave 0 to use the number as typed.',
    plain: 'Turn on for years like 2017 (no counting animation, no comma).',
    mapQuery: 'What Google Maps should search for to show the pin.',
    whatsapp: 'With country code, e.g. +8801…',
    entry: 'The number after “entry.” in your pre-filled link (see the help box above).',
    actionUrl: 'Usually ends with /formResponse.',
    viewUrl: 'The normal public link of your Google Form.',
    icon: 'Picture shown on the card.',
    keywords: 'Separate with commas.',
    id: 'A short unique code, no spaces. Used by the site to link things.',
    thumb: 'The photo shown on the album card.',
    poster: 'Picture shown before the video plays.',
    video: 'YouTube link (e.g. https://youtu.be/…).',
    logo: 'PNG with transparent background looks best.',
    hours: 'e.g. Sun–Thu, 9 am – 6 pm',
    suffix: 'Optional, e.g. “+” or “%”.',
    linkedin: 'Optional link to their LinkedIn profile.',
    words: 'Short words that scroll across the banner.'
  };
  var HINTS_BY_PATH = {
    'gallery.categories': 'Albums are grouped by these. You can also create one from an album’s Category menu.',
    'gallery.albums.*.logo': 'Optional: the client company’s logo.',
    'gallery.albums.*.driveFolder': 'Optional: photos and videos in this Drive folder are added to this album automatically.',
    'gallery.driveSources': 'Each folder’s subfolders become albums in the chosen category.',
    'gallery.driveSources.*.title': 'Optional. Leave empty to use the folder names.',
    'gallery.albums.*.date': 'Optional, e.g. “March 2026”.',
    'brand.logo': 'Leave empty to use the built-in heart logo.',
    'seo.title': 'About 50–60 characters works best.',
    'seo.description': 'About 150 characters works best.'
  };
  var SINGULAR = {
    'hero.slides': 'slide', 'marquee.items': 'client logo', 'about.timeline': 'timeline step', 'stats.items': 'number',
    'training.sectors': 'sector', 'modules.items': 'module', 'lab.scenes': 'scenario', 'equipment.aed.models': 'AED model',
    'equipment.categories': 'category', 'gallery.albums': 'album', 'team.members': 'team member',
    'enquiry.googleForm.fields': 'question', 'gallery.driveSources': 'Drive folder', 'contact.phones': 'phone number', 'contact.socials': 'social link', 'nav': 'menu link',
    'about.points': 'point', 'modules.items.*.tags': 'tag', 'compliance.words': 'word', 'gallery.categories': 'category',
    'equipment.categories.*.items': 'product', 'enquiry.googleForm.fields.*.options': 'choice', 'lab.scenes.*.steps': 'step',
    'emergency.steps': 'step'
  };
  var FALLBACK_TPL = {
    'gallery.albums': { id: '', title: '', category: '', date: '', summary: '', thumb: '', images: [], link: '', logo: '', video: '' },
    'team.members': { name: '', role: '', photo: '', bio: '', linkedin: '' },
    'marquee.items': { name: '', logo: '', url: '' },
    'gallery.driveSources': { category: '', folder: '', title: '' },
    'enquiry.googleForm.fields': { label: '', entry: '', type: 'text', required: false, options: [] }
  };

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */
  var S = {
    started: false, root: null, live: null, draft: null, section: null, search: '', view: 'edit', device: 'desktop',
    expanded: new WeakSet(), justAdded: null, drag: null, els: {}, savedAt: null, saveState: 'idle', iframe: null,
    timers: {}, bytes: 0
  };

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function last(a) { return a[a.length - 1]; }
  function ps(path) { return path.join('.'); }
  function schemaPath(path) { return path.map(function (p) { return typeof p === 'number' ? '*' : p; }).join('.'); }
  function getIn(root, path) { var o = root; for (var i = 0; i < path.length; i++) { if (o == null) return undefined; o = o[path[i]]; } return o; }
  function getAt(path) { return getIn(S.draft, path); }
  function setAt(path, v) { var p = getAt(path.slice(0, -1)); if (p != null) p[last(path)] = v; }
  var uid = 0;
  function nextId(p) { uid++; return (p || 'fa') + '-' + uid; }
  function friendlyKey(k) {
    if (typeof k === 'number') return 'Item ' + (k + 1);
    if (LABELS[k]) return LABELS[k];
    var s = String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function labelFor(path) {
    var sp = schemaPath(path);
    if (LABELS_BY_PATH[sp]) return LABELS_BY_PATH[sp];
    if (path.length === 1 && SECTIONS[path[0]]) return SECTIONS[path[0]].label;
    return friendlyKey(last(path));
  }
  function hintFor(path) { var sp = schemaPath(path); return HINTS_BY_PATH[sp] || HINTS[last(path)] || ''; }
  function singularFor(path) {
    var sp = schemaPath(path);
    if (SINGULAR[sp]) return SINGULAR[sp];
    var k = String(last(path));
    if (/ies$/.test(k)) return k.replace(/ies$/, 'y');
    if (/s$/.test(k)) return friendlyKey(k.replace(/s$/, '')).toLowerCase();
    return 'item';
  }
  function fmtBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < MB) return Math.round(b / 1024) + ' KB';
    return (b / MB).toFixed(b < 10 * MB ? 2 : 1) + ' MB';
  }
  function dataUrlBytes(u) { var i = u.indexOf(','); return Math.round((u.length - i - 1) * 3 / 4); }
  function isDataUrl(s) { return typeof s === 'string' && s.slice(0, 5) === 'data:'; }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function timeStr(t) { try { return new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return new Date(t).toString(); } }
  function shortTime(t) { try { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function withoutMeta(o) { if (!isObj(o)) return o; var c = Object.assign({}, o); delete c.meta; return c; }
  function sameContent(a, b) { return JSON.stringify(withoutMeta(a)) === JSON.stringify(withoutMeta(b)); }
  function isPhoneLayout() { return window.matchMedia('(max-width: 899px)').matches; }
  function canHover() { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; }
  function debounce(name, fn, ms) { clearTimeout(S.timers[name]); S.timers[name] = setTimeout(fn, ms); }
  function trunc(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function b64(buf) { var s = ''; var a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(str) { var s = atob(str); var a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }

  /* ------------------------------------------------------------------ */
  /* Icons                                                               */
  /* ------------------------------------------------------------------ */
  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.7 1.6-1.5 0-.9-.8-1.3-.8-2.2 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.3-4-7.8-9-7.8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    sparkle: '<path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    chart: '<path d="M5 20V11M11 20V5M17 20v-7M3 20h18"/>',
    cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v5"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5v-14M8 7h8"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>',
    kit: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M12 10.5v6M9 13.5h6"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 21h14v-3H5zM12 3v2M4.2 6.2l1.4 1.4M19.8 6.2l-1.4 1.4"/>',
    layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', left: '<path d="m15 6-6 6 6 6"/>', right: '<path d="m9 6 6 6-6 6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5M12 17v.5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    desktop: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    tablet: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 18h2"/>',
    mobile: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    fileup: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 18v-6M9 15l3-3 3 3"/>',
    restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.7-4.4L3 9"/><path d="M3 4v5h5M4 13a8 8 0 0 0 14.7 4.4L21 15"/><path d="M21 20v-5h-5"/>',
    weight: '<path d="M6 8h12l2 12H4z"/><circle cx="12" cy="5" r="2"/>'
  };
  function icon(name, cls) {
    var s = document.createElement('span');
    s.className = 'fa-ic' + (cls ? ' ' + cls : '');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
    return s;
  }
  var HEART = 'M0,-9 C-5,-14 -14,-20 -14,-28 C-14,-33 -10.5,-36 -7,-36 C-3.8,-36 -1.2,-34 0,-31.5 C1.2,-34 3.8,-36 7,-36 C10.5,-36 14,-33 14,-28 C14,-20 5,-14 0,-9 Z';
  function logoMark(size, extraCls) {
    var g = '';
    for (var i = 0; i < 6; i++) {
      var blue = extraCls === 'on-dark' ? '#4652D0' : '#283090';
      g += '<path d="' + HEART + '" transform="rotate(' + (i * 60) + ')" fill="' + (i % 2 ? blue : '#F8B040') + '"' + (i % 2 ? ' stroke="rgba(255,255,255,.35)" stroke-width="1"' : '') + '/>';
    }
    var s = document.createElement('span');
    s.className = 'fa-logo' + (extraCls ? ' ' + extraCls : '');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="-40 -40 80 80" width="' + size + '" height="' + size + '"><g class="fa-logo-g">' + g + '</g></svg>';
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Styles                                                              */
  /* ------------------------------------------------------------------ */
  var CSS = [
    'html.fa-admin-html,html.fa-admin-html body{margin:0!important;padding:0!important;height:100%;overflow:hidden!important;background:#F6F4EE!important;}',
    '.fa-admin{--blue:#283090;--blue2:#3942b5;--blue-soft:#E8EAF8;--amber:#F8B040;--amber-soft:#FEF2DA;--ink:#0A0F2C;--paper:#F6F4EE;--red:#E63946;--red-soft:#FDE8EA;--ok:#14855C;--ok-soft:#E1F4EC;--line:rgba(10,15,44,.10);--line2:rgba(10,15,44,.16);--muted:#5A607E;--card:#fff;--r:18px;--r-md:14px;--r-sm:10px;--sh:0 1px 2px rgba(10,15,44,.05),0 10px 30px -14px rgba(10,15,44,.22);--sh-lg:0 30px 80px -20px rgba(10,15,44,.45);--ease:cubic-bezier(.2,.8,.2,1);',
    'position:fixed;inset:0;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:15px;line-height:1.45;color:var(--ink);background:var(--paper);-webkit-font-smoothing:antialiased;text-align:left;letter-spacing:normal;z-index:2147483000;}',
    '.fa-admin *,.fa-admin *::before,.fa-admin *::after{box-sizing:border-box;}',
    ':where(.fa-admin) :where(h1,h2,h3,h4){font-family:"Familjen Grotesk",Inter,system-ui,sans-serif;margin:0;letter-spacing:-.01em;line-height:1.15;color:inherit;text-transform:none;font-weight:700;}',
    ':where(.fa-admin) p{margin:0;}',
    ':where(.fa-admin) :where(button,input,select,textarea){font:inherit;color:inherit;letter-spacing:normal;text-transform:none;}',
    ':where(.fa-admin) button{cursor:pointer;background:none;border:0;padding:0;margin:0;-webkit-tap-highlight-color:transparent;}',
    ':where(.fa-admin) a{color:var(--blue);}',
    '.fa-admin :focus{outline:none;}',
    '.fa-admin :focus-visible{outline:3px solid var(--amber)!important;outline-offset:2px;border-radius:10px;}',
    '.fa-admin input:focus-visible,.fa-admin textarea:focus-visible,.fa-admin select:focus-visible{outline-offset:0;}',
    '.fa-ic{display:inline-flex;width:20px;height:20px;flex:none;}.fa-ic svg{width:100%;height:100%;}',
    '.fa-hidden{display:none!important;}',
    '.fa-show-sm{display:none;}',
    '.fa-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}',
    /* buttons */
    '.fa-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:12px;font-weight:600;font-size:14.5px;white-space:nowrap;transition:transform .15s var(--ease),background .15s,box-shadow .15s,color .15s;user-select:none;}',
    '.fa-btn:active{transform:scale(.97);}',
    '.fa-btn[disabled]{opacity:.45;pointer-events:none;}',
    '.fa-btn-primary{background:var(--blue);color:#fff;box-shadow:0 8px 20px -10px rgba(40,48,144,.8);}',
    '.fa-btn-primary:hover{background:var(--blue2);}',
    '.fa-btn-amber{background:var(--amber);color:var(--ink);box-shadow:0 8px 20px -10px rgba(248,176,64,.9);}',
    '.fa-btn-amber:hover{background:#ffbd55;}',
    '.fa-btn-soft{background:var(--blue-soft);color:var(--blue);}',
    '.fa-btn-soft:hover{background:#dde0f5;}',
    '.fa-btn-ghost{background:transparent;color:var(--ink);border:1px solid var(--line2);}',
    '.fa-btn-ghost:hover{background:rgba(10,15,44,.04);}',
    '.fa-btn-danger{background:var(--red);color:#fff;}',
    '.fa-btn-danger-ghost{color:var(--red);border:1px solid rgba(230,57,70,.35);background:#fff;}',
    '.fa-btn-danger-ghost:hover{background:var(--red-soft);}',
    '.fa-btn-block{width:100%;}',
    '.fa-btn-lg{min-height:52px;font-size:16px;padding:0 22px;border-radius:14px;}',
    '.fa-ibtn{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;color:var(--muted);flex:none;transition:background .15s,color .15s,transform .15s;}',
    '.fa-ibtn:hover{background:rgba(10,15,44,.06);color:var(--ink);}',
    '.fa-ibtn:active{transform:scale(.92);}',
    '.fa-ibtn[disabled]{opacity:.3;pointer-events:none;}',
    '.fa-ibtn.danger:hover{background:var(--red-soft);color:var(--red);}',
    /* app shell */
    '.fa-app{position:absolute;inset:0;display:grid;grid-template-rows:64px minmax(0,1fr);}',
    '.fa-top{display:flex;align-items:center;gap:12px;padding:0 16px 0 14px;background:rgba(255,255,255,.82);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid var(--line);z-index:5;min-width:0;}',
    '.fa-brand{display:flex;align-items:center;gap:10px;min-width:0;flex:1 1 auto;}',
    '.fa-brand-t{display:flex;flex-direction:column;min-width:0;}',
    '.fa-brand-t b{font-family:"Familjen Grotesk",Inter,sans-serif;font-size:17px;line-height:1.1;white-space:nowrap;}',
    '.fa-brand-t small{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.fa-top-actions{display:flex;align-items:center;gap:8px;flex:none;}',
    '.fa-logo{display:inline-flex;flex:none;}',
    '.fa-logo-g{transform-origin:center;}',
    '.fa-main{display:grid;grid-template-columns:84px 440px minmax(0,1fr);min-height:0;}',
    '.fa-tabs{display:none;}',
    /* rail */
    '.fa-rail{background:var(--ink);color:#c9cce0;overflow-y:auto;padding:10px 8px 18px;display:flex;flex-direction:column;gap:2px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.15) transparent;}',
    '.fa-rail-btn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:9px 4px 8px;border-radius:12px;font-size:10.5px;line-height:1.15;text-align:center;color:inherit;transition:background .15s,color .15s;position:relative;}',
    '.fa-rail-btn:hover{background:rgba(255,255,255,.07);color:#fff;}',
    '.fa-rail-btn[aria-current="true"]{background:rgba(248,176,64,.14);color:var(--amber);}',
    '.fa-rail-btn[aria-current="true"]::before{content:"";position:absolute;left:-8px;top:12px;bottom:12px;width:3px;border-radius:3px;background:var(--amber);}',
    '.fa-rail-sep{height:1px;background:rgba(255,255,255,.08);margin:6px 8px;}',
    /* editor */
    '.fa-editor{display:flex;flex-direction:column;min-height:0;min-width:0;background:var(--paper);border-right:1px solid var(--line);}',
    '.fa-ed-head{padding:12px 16px 10px;display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--line);background:linear-gradient(var(--paper),rgba(246,244,238,.9));}',
    '.fa-search{position:relative;display:flex;align-items:center;}',
    '.fa-search .fa-ic{position:absolute;left:13px;color:var(--muted);pointer-events:none;}',
    '.fa-search input{width:100%;min-height:44px;border-radius:12px;border:1px solid var(--line2);background:#fff;padding:0 44px 0 42px;font-size:15px;transition:border-color .15s,box-shadow .15s;}',
    '.fa-search input:focus{border-color:var(--blue);box-shadow:0 0 0 4px rgba(40,48,144,.12);}',
    '.fa-search .fa-ibtn{position:absolute;right:0;}',
    '.fa-status{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:12.5px;}',
    '.fa-chip-size{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 10px;border-radius:999px;background:var(--ok-soft);color:var(--ok);font-weight:600;transition:background .2s,color .2s;}',
    '.fa-chip-size.warn{background:var(--amber-soft);color:#8a5600;}',
    '.fa-chip-size.danger{background:var(--red-soft);color:#b0202c;}',
    '.fa-chip-size .fa-ic{width:15px;height:15px;}',
    '.fa-save{display:inline-flex;align-items:center;gap:5px;color:var(--muted);min-height:30px;}',
    '.fa-save .fa-ic{width:16px;height:16px;}',
    '.fa-save.saved{color:var(--ok);}',
    '.fa-save.saved .fa-ic path{stroke-dasharray:24;stroke-dashoffset:24;animation:faDraw .5s .05s var(--ease) forwards;}',
    '.fa-save.error{color:var(--red);}',
    '.fa-dot{width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block;}',
    '.fa-save.saving .fa-dot{animation:faPulse 1s infinite;}',
    '.fa-unpub{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:0 10px;border-radius:999px;background:var(--amber-soft);color:#7a4c00;font-weight:600;}',
    '.fa-sizewarn{font-size:12.5px;padding:8px 10px;border-radius:10px;background:var(--amber-soft);color:#7a4c00;}',
    '.fa-sizewarn.danger{background:var(--red-soft);color:#a01d28;}',
    '.fa-ed-body{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:16px 16px 120px;scroll-behavior:smooth;overscroll-behavior:contain;}',
    '.fa-anim-in{animation:faIn .32s var(--ease) both;}',
    /* home */
    '.fa-welcome{position:relative;overflow:hidden;border-radius:var(--r);padding:20px;background:radial-gradient(120% 140% at 100% 0%,#3a43b6 0%,var(--blue) 45%,#1b2170 100%);color:#fff;box-shadow:var(--sh);}',
    '.fa-welcome h2{font-size:22px;margin-bottom:6px;}',
    '.fa-welcome p{color:rgba(255,255,255,.82);font-size:14px;}',
    '.fa-welcome ol{margin:14px 0 0;padding:0;list-style:none;display:grid;gap:8px;counter-reset:s;}',
    '.fa-welcome li{display:flex;gap:10px;align-items:flex-start;font-size:14px;color:rgba(255,255,255,.92);counter-increment:s;}',
    '.fa-welcome li::before{content:counter(s);flex:none;width:24px;height:24px;border-radius:50%;background:var(--amber);color:var(--ink);font-weight:700;font-size:13px;display:grid;place-items:center;}',
    '.fa-welcome .fa-logo{position:absolute;right:-26px;top:-26px;opacity:.18;}',
    '.fa-h-sub{margin:22px 2px 10px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);}',
    '.fa-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;}',
    '.fa-tile{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:14px;border-radius:var(--r-md);background:#fff;border:1px solid var(--line);box-shadow:var(--sh);text-align:left;min-height:104px;transition:transform .18s var(--ease),box-shadow .18s,border-color .18s;}',
    '.fa-tile:hover{transform:translateY(-2px);border-color:rgba(40,48,144,.35);box-shadow:0 14px 30px -16px rgba(40,48,144,.45);}',
    '.fa-tile .fa-ic{width:36px;height:36px;padding:8px;border-radius:10px;background:var(--blue-soft);color:var(--blue);}',
    '.fa-tile b{font-size:14.5px;line-height:1.2;}',
    '.fa-tile small{font-size:12px;color:var(--muted);line-height:1.3;}',
    /* section */
    '.fa-sec-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:16px;}',
    '.fa-sec-head .fa-sec-ic{width:44px;height:44px;padding:10px;border-radius:12px;background:var(--blue);color:#fff;flex:none;}',
    '.fa-sec-head h2{font-size:22px;}',
    '.fa-sec-head p{font-size:13px;color:var(--muted);margin-top:2px;}',
    '.fa-back{display:inline-flex;align-items:center;gap:4px;min-height:40px;padding:0 10px 0 4px;margin:-6px 0 8px -4px;border-radius:10px;color:var(--blue);font-weight:600;font-size:14px;}',
    '.fa-back:hover{background:var(--blue-soft);}',
    '.fa-sec-tools{display:flex;gap:8px;flex-wrap:wrap;margin:-4px 0 14px;}',
    '.fa-sec-tools .fa-btn{min-height:38px;font-size:13px;padding:0 12px;}',
    /* fields */
    '.fa-fields{display:flex;flex-direction:column;gap:14px;}',
    '.fa-field{display:flex;flex-direction:column;gap:6px;min-width:0;}',
    '.fa-label{font-weight:600;font-size:13.5px;color:var(--ink);display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
    '.fa-count{font-size:11.5px;font-weight:700;color:var(--blue);background:var(--blue-soft);border-radius:999px;padding:1px 8px;}',
    '.fa-hint{font-size:12.5px;color:var(--muted);margin-top:-2px;}',
    '.fa-input,.fa-select,.fa-textarea{width:100%;min-height:44px;border-radius:12px;border:1px solid var(--line2);background:#fff;padding:10px 12px;font-size:15px;line-height:1.4;transition:border-color .15s,box-shadow .15s;min-width:0;}',
    '.fa-input:hover,.fa-select:hover,.fa-textarea:hover{border-color:rgba(10,15,44,.28);}',
    '.fa-input:focus,.fa-select:focus,.fa-textarea:focus{border-color:var(--blue);box-shadow:0 0 0 4px rgba(40,48,144,.12);}',
    '.fa-textarea{resize:vertical;min-height:84px;overflow:hidden;}',
    '.fa-select{appearance:none;-webkit-appearance:none;padding-right:40px;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%235A607E%27 stroke-width=%272%27 stroke-linecap=%27round%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;background-size:18px;}',
    '.fa-row{display:flex;gap:8px;align-items:center;min-width:0;}',
    '.fa-row>.fa-input{flex:1;}',
    '.fa-test{display:inline-flex;align-items:center;gap:4px;min-height:44px;padding:0 12px;border-radius:12px;background:var(--blue-soft);color:var(--blue);font-weight:600;font-size:13px;text-decoration:none;flex:none;}',
    '.fa-test[aria-disabled="true"]{opacity:.4;pointer-events:none;}',
    '.fa-test .fa-ic{width:16px;height:16px;}',
    '.fa-drive-res{font-size:13px;font-weight:600;color:var(--muted);}.fa-drive-res:empty{display:none;}',
    '.fa-drive-res.ok{color:var(--ok);}.fa-drive-res.err{color:#b0202c;}',
    '.fa-group{border:1px solid var(--line);border-radius:var(--r-md);background:rgba(255,255,255,.55);padding:14px;display:flex;flex-direction:column;gap:14px;min-width:0;margin:0;}',
    '.fa-group-t{font-family:"Familjen Grotesk",Inter,sans-serif;font-weight:700;font-size:15px;display:flex;align-items:center;gap:8px;padding:0;}',
    '.fa-readonly{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;padding:14px;border-radius:var(--r-md);background:#fff;border:1px dashed var(--line2);font-size:14px;}',
    '.fa-readonly dt{color:var(--muted);}',
    '.fa-readonly dd{margin:0;font-weight:600;}',
    /* switch */
    '.fa-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:6px 6px 6px 12px;border-radius:12px;background:#fff;border:1px solid var(--line2);cursor:pointer;}',
    '.fa-switch input{position:absolute;opacity:0;width:1px;height:1px;}',
    '.fa-switch-ui{position:relative;width:48px;height:28px;border-radius:999px;background:#cfd2e2;transition:background .2s;flex:none;}',
    '.fa-switch-ui::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(10,15,44,.25);transition:transform .22s var(--ease);}',
    '.fa-switch input:checked+.fa-switch-ui{background:var(--blue);}',
    '.fa-switch input:checked+.fa-switch-ui::after{transform:translateX(20px);}',
    '.fa-switch input:focus-visible+.fa-switch-ui{outline:3px solid var(--amber);outline-offset:2px;}',
    /* colour */
    '.fa-color{display:flex;align-items:center;gap:10px;}',
    '.fa-color input[type=color]{width:52px;height:44px;border:1px solid var(--line2);border-radius:12px;padding:3px;background:#fff;cursor:pointer;flex:none;}',
    '.fa-color input[type=color]::-webkit-color-swatch-wrapper{padding:0;}',
    '.fa-color input[type=color]::-webkit-color-swatch{border:0;border-radius:8px;}',
    '.fa-color .fa-input{font-family:ui-monospace,Menlo,Consolas,monospace;text-transform:uppercase;max-width:150px;}',
    /* image field */
    '.fa-img{display:flex;gap:12px;align-items:flex-start;padding:10px;border-radius:var(--r-md);background:#fff;border:1px solid var(--line2);transition:border-color .15s,background .15s;min-width:0;}',
    '.fa-img.drag{border-color:var(--blue);background:var(--blue-soft);}',
    '.fa-img-prev{width:96px;height:72px;border-radius:10px;flex:none;overflow:hidden;display:grid;place-items:center;color:#9ba0bb;background:repeating-conic-gradient(#f1f0ea 0 25%,#fbfaf6 0 50%) 0 0/14px 14px;}',
    '.fa-img-prev img{width:100%;height:100%;object-fit:cover;display:block;}',
    '.fa-img-prev.contain img{object-fit:contain;}',
    '.fa-img-side{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;}',
    '.fa-img-btns{display:flex;gap:8px;flex-wrap:wrap;}',
    '.fa-img-btns .fa-btn{min-height:40px;padding:0 12px;font-size:13.5px;}',
    '.fa-img-meta{font-size:12px;color:var(--muted);display:flex;gap:6px;align-items:center;flex-wrap:wrap;}',
    '.fa-pill{display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;background:var(--blue-soft);color:var(--blue);font-weight:600;font-size:11.5px;}',
    '.fa-pill.ok{background:var(--ok-soft);color:var(--ok);}',
    '.fa-pill.warn{background:var(--amber-soft);color:#7a4c00;}',
    '.fa-img .fa-input{min-height:40px;font-size:13.5px;padding:8px 10px;}',
    /* lists & cards */
    '.fa-list{display:flex;flex-direction:column;gap:10px;min-width:0;}',
    '.fa-list-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}',
    '.fa-cards{display:flex;flex-direction:column;gap:10px;}',
    '.fa-card{background:#fff;border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--sh);transition:box-shadow .2s,border-color .2s,opacity .2s,transform .2s;min-width:0;}',
    '.fa-card.open{border-color:rgba(40,48,144,.28);}',
    '.fa-card.dragging{opacity:.45;}',
    '.fa-card.drop-before{box-shadow:0 -3px 0 0 var(--amber),var(--sh);}',
    '.fa-card.drop-after{box-shadow:0 3px 0 0 var(--amber),var(--sh);}',
    '.fa-card-head{display:flex;align-items:center;gap:4px;padding:6px 6px 6px 4px;min-height:58px;}',
    '.fa-grip{width:32px;height:44px;display:inline-flex;align-items:center;justify-content:center;color:#a3a7c0;cursor:grab;border-radius:10px;flex:none;}',
    '.fa-grip:active{cursor:grabbing;}',
    '.fa-card-thumb{width:40px;height:40px;border-radius:10px;flex:none;overflow:hidden;background:var(--blue-soft);color:var(--blue);display:grid;place-items:center;font-weight:700;font-family:"Familjen Grotesk",Inter,sans-serif;font-size:16px;}',
    '.fa-card-thumb img{width:100%;height:100%;object-fit:cover;}',
    '.fa-card-thumb.contain img{object-fit:contain;background:#fff;}',
    '.fa-card-title{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;min-height:44px;padding:0 6px;text-align:left;border-radius:10px;}',
    '.fa-card-title b{font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.fa-card-title small{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.fa-chev{transition:transform .25s var(--ease);}',
    '.fa-card.open .fa-chev{transform:rotate(180deg);}',
    '.fa-card-body{display:none;padding:4px 14px 16px;border-top:1px solid var(--line);}',
    '.fa-card.open>.fa-card-body{display:block;animation:faIn .25s var(--ease);}',
    '.fa-card-tools{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 14px;}',
    '.fa-card-tools .fa-btn{min-height:40px;padding:0 12px;font-size:13px;}',
    '.fa-enter{animation:faPop .42s var(--ease);}',
    '.fa-leave{animation:faOut .2s ease forwards;}',
    '.fa-flash{animation:faFlash 1.6s ease;}',
    '.fa-add{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:50px;border-radius:var(--r-md);border:1.5px dashed rgba(40,48,144,.35);color:var(--blue);font-weight:600;background:rgba(255,255,255,.5);transition:background .15s,border-color .15s;}',
    '.fa-add:hover{background:var(--blue-soft);border-color:var(--blue);}',
    '.fa-add-big{min-height:60px;font-size:16px;background:var(--blue);color:#fff;border:0;box-shadow:0 12px 24px -12px rgba(40,48,144,.8);}',
    '.fa-add-big:hover{background:var(--blue2);}',
    /* chips */
    '.fa-chips{display:flex;flex-wrap:wrap;gap:6px;padding:8px;border-radius:12px;background:#fff;border:1px solid var(--line2);min-width:0;}',
    '.fa-chip{display:inline-flex;align-items:center;max-width:100%;border-radius:999px;background:var(--blue-soft);color:var(--blue);font-weight:600;font-size:13.5px;animation:faPop .3s var(--ease);}',
    '.fa-chip-t{padding:0 4px 0 12px;min-height:36px;display:inline-flex;align-items:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px;border-radius:999px;}',
    '.fa-chip .fa-ibtn{width:36px;height:36px;color:var(--blue);border-radius:999px;}',
    '.fa-chip .fa-ibtn .fa-ic{width:16px;height:16px;}',
    '.fa-chip-edit{min-height:36px;border-radius:999px;border:1.5px solid var(--blue);padding:0 12px;width:180px;max-width:100%;font-size:13.5px;}',
    '.fa-chip-add{display:flex;gap:6px;flex:1 1 180px;min-width:0;}',
    '.fa-chip-add input{flex:1;min-width:0;min-height:40px;border:0;background:transparent;padding:0 8px;font-size:14px;}',
    '.fa-chip-add .fa-btn{min-height:40px;padding:0 12px;font-size:13px;}',
    /* rows */
    '.fa-rows{display:flex;flex-direction:column;gap:8px;}',
    '.fa-rowi{display:flex;align-items:flex-start;gap:4px;animation:faIn .25s var(--ease);}',
    '.fa-rowi .fa-num{width:26px;flex:none;height:44px;display:grid;place-items:center;font-size:12px;font-weight:700;color:var(--muted);}',
    '.fa-rowi .fa-textarea{min-height:44px;flex:1;}',
    /* image grid */
    '.fa-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:22px 16px;min-height:130px;border-radius:var(--r);border:2px dashed rgba(40,48,144,.35);background:linear-gradient(180deg,#fff,var(--blue-soft));color:var(--blue);text-align:center;cursor:pointer;transition:background .2s,border-color .2s,transform .2s;width:100%;}',
    '.fa-drop:hover,.fa-drop.drag{border-color:var(--blue);background:var(--blue-soft);}',
    '.fa-drop.drag{transform:scale(1.01);}',
    '.fa-drop .fa-ic{width:34px;height:34px;}',
    '.fa-drop b{font-family:"Familjen Grotesk",Inter,sans-serif;font-size:18px;}',
    '.fa-drop small{color:var(--muted);font-size:12.5px;}',
    '.fa-progress{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:12px;background:#fff;border:1px solid var(--line);font-size:13px;}',
    '.fa-bar{height:8px;border-radius:999px;background:var(--blue-soft);overflow:hidden;}',
    '.fa-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--blue),#5560d8);border-radius:999px;transition:width .3s var(--ease);}',
    '.fa-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;}',
    '.fa-tilei{position:relative;border-radius:12px;overflow:hidden;background:#eceae3;aspect-ratio:4/3;animation:faPop .3s var(--ease);}',
    '.fa-tilei.dragging{opacity:.4;}',
    '.fa-tilei.drop-before{box-shadow:-4px 0 0 0 var(--amber);}',
    '.fa-tilei.drop-after{box-shadow:4px 0 0 0 var(--amber);}',
    '.fa-tilei>button.fa-tile-open{position:absolute;inset:0;width:100%;height:100%;display:block;border-radius:12px;}',
    '.fa-tilei img{width:100%;height:100%;object-fit:cover;display:block;}',
    '.fa-tile-badge{position:absolute;left:6px;top:6px;padding:2px 8px;border-radius:999px;background:var(--amber);color:var(--ink);font-size:11px;font-weight:700;pointer-events:none;}',
    '.fa-tile-num{position:absolute;right:6px;top:6px;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:rgba(10,15,44,.6);color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center;pointer-events:none;}',
    '.fa-tile-acts{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:center;gap:2px;padding:20px 4px 4px;background:linear-gradient(transparent,rgba(10,15,44,.7));opacity:0;transform:translateY(6px);transition:opacity .15s,transform .15s;}',
    '.fa-tile-acts .fa-ibtn{width:32px;height:32px;color:#fff;border-radius:8px;}',
    '.fa-tile-acts .fa-ibtn:hover{background:rgba(255,255,255,.2);color:#fff;}',
    '.fa-tile-acts .fa-ibtn .fa-ic{width:17px;height:17px;}',
    '@media (hover:hover) and (pointer:fine){.fa-tilei:hover .fa-tile-acts,.fa-tilei:focus-within .fa-tile-acts{opacity:1;transform:none;}}',
    '@media not all and (hover:hover){.fa-tile-acts{display:none;}}',
    /* help */
    '.fa-help{border-radius:var(--r-md);padding:14px 14px 14px 14px;background:var(--amber-soft);border:1px solid rgba(248,176,64,.5);font-size:13.5px;color:#3d2a00;}',
    '.fa-help h4{font-size:15px;margin-bottom:6px;display:flex;align-items:center;gap:6px;color:var(--ink);}',
    '.fa-help ol,.fa-help ul{margin:6px 0 0;padding-left:20px;display:grid;gap:4px;}',
    '.fa-help code{background:rgba(255,255,255,.7);padding:1px 5px;border-radius:5px;font-size:12.5px;}',
    '.fa-help details{margin-top:8px;}',
    '.fa-help summary{cursor:pointer;font-weight:600;min-height:36px;display:flex;align-items:center;}',
    /* preview */
    '.fa-preview{display:flex;flex-direction:column;min-height:0;min-width:0;background:#E7E4DA;background-image:radial-gradient(rgba(10,15,44,.07) 1px,transparent 1px);background-size:18px 18px;}',
    '.fa-pv-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line);background:rgba(246,244,238,.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}',
    '.fa-seg{display:inline-flex;padding:3px;border-radius:12px;background:rgba(10,15,44,.07);gap:2px;}',
    '.fa-seg button{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:0 12px;border-radius:9px;font-size:13px;font-weight:600;color:var(--muted);transition:background .15s,color .15s;}',
    '.fa-seg button[aria-pressed="true"]{background:#fff;color:var(--blue);box-shadow:0 2px 8px -2px rgba(10,15,44,.2);}',
    '.fa-pv-label{font-size:12.5px;color:var(--muted);display:flex;align-items:center;gap:6px;}',
    '.fa-pv-live{width:8px;height:8px;border-radius:50%;background:#20b072;box-shadow:0 0 0 0 rgba(32,176,114,.6);animation:faRing 2s infinite;}',
    '.fa-pv-stage{flex:1;min-height:0;position:relative;overflow:hidden;display:flex;justify-content:center;align-items:flex-start;padding:16px;}',
    '.fa-pv-wrap{position:relative;flex:none;border-radius:14px;overflow:hidden;background:#fff;box-shadow:var(--sh-lg);transition:width .35s var(--ease);}',
    '.fa-pv-wrap iframe{position:absolute;left:0;top:0;border:0;transform-origin:0 0;background:#fff;}',
    '.fa-pv-wrap.phone{border-radius:28px;box-shadow:0 0 0 8px #0A0F2C,var(--sh-lg);}',
    '.fa-pv-wrap.tablet{border-radius:20px;box-shadow:0 0 0 8px #0A0F2C,var(--sh-lg);}',
    /* toasts */
    '.fa-toasts{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;z-index:30;width:min(520px,calc(100vw - 24px));pointer-events:none;}',
    '.fa-toast{pointer-events:auto;display:flex;align-items:center;gap:10px;width:100%;padding:8px 8px 8px 14px;min-height:52px;border-radius:14px;background:var(--ink);color:#fff;box-shadow:var(--sh-lg);font-size:14px;animation:faToastIn .3s var(--ease);}',
    '.fa-toast.out{animation:faToastOut .2s ease forwards;}',
    '.fa-toast .fa-ic{width:20px;height:20px;}',
    '.fa-toast.ok .fa-tic{color:#5fe0a8;}',
    '.fa-toast.warn .fa-tic{color:var(--amber);}',
    '.fa-toast.err .fa-tic{color:#ff8a93;}',
    '.fa-toast-msg{flex:1;min-width:0;}',
    '.fa-toast .fa-btn{min-height:38px;padding:0 14px;background:rgba(255,255,255,.12);color:var(--amber);}',
    '.fa-toast .fa-btn:hover{background:rgba(255,255,255,.2);}',
    '.fa-toast .fa-ibtn{width:38px;height:38px;color:rgba(255,255,255,.7);}',
    '.fa-toast .fa-ibtn:hover{background:rgba(255,255,255,.1);color:#fff;}',
    /* modal */
    '.fa-modal-ov{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,15,44,.5);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:faFade .2s ease;}',
    '.fa-modal-ov.out{animation:faFadeOut .18s ease forwards;}',
    '.fa-modal{width:min(560px,100%);max-height:calc(100dvh - 40px);display:flex;flex-direction:column;background:#fff;border-radius:22px;box-shadow:var(--sh-lg);animation:faModalIn .32s var(--ease);overflow:hidden;}',
    '.fa-modal.wide{width:min(760px,100%);}',
    '.fa-modal-head{display:flex;align-items:flex-start;gap:12px;padding:20px 20px 8px;}',
    '.fa-modal-head h2{font-size:21px;flex:1;padding-top:8px;}',
    '.fa-modal-ic{width:44px;height:44px;padding:10px;border-radius:12px;background:var(--blue-soft);color:var(--blue);flex:none;}',
    '.fa-modal-ic.warn{background:var(--amber-soft);color:#a66a00;}',
    '.fa-modal-ic.danger{background:var(--red-soft);color:var(--red);}',
    '.fa-modal-ic.ok{background:var(--ok-soft);color:var(--ok);}',
    '.fa-modal-ic.ok path{stroke-dasharray:24;stroke-dashoffset:24;animation:faDraw .6s .15s var(--ease) forwards;}',
    '.fa-modal-body{padding:6px 20px 16px;overflow-y:auto;font-size:14.5px;color:#2a2f4d;display:flex;flex-direction:column;gap:12px;}',
    '.fa-modal-foot{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding:14px 20px 20px;border-top:1px solid var(--line);background:#fbfaf7;}',
    '.fa-tbl{width:100%;border-collapse:collapse;font-size:13.5px;}',
    '.fa-tbl th,.fa-tbl td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top;}',
    '.fa-tbl th{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}',
    '.fa-tbl th.num{text-align:right;}',
    '.fa-tbl td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}',
    '.fa-tbl tr.less td{color:#b0202c;font-weight:600;}',
    '.fa-shrink{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none;}',
    '.fa-shrink li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:12px;background:var(--red-soft);color:#7d1720;font-size:14px;}',
    '.fa-shrink li b{white-space:nowrap;}',
    '.fa-big-list{display:flex;flex-direction:column;gap:8px;}',
    '.fa-big-item{display:flex;align-items:center;gap:10px;padding:6px;border-radius:12px;border:1px solid var(--line);}',
    '.fa-big-item img{width:56px;height:42px;object-fit:cover;border-radius:8px;flex:none;}',
    '.fa-big-item div{flex:1;min-width:0;font-size:13px;}',
    '.fa-big-item div b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.fa-steps{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px;counter-reset:st;}',
    '.fa-steps li{display:flex;gap:12px;counter-increment:st;font-size:14.5px;}',
    '.fa-steps li::before{content:counter(st);flex:none;width:28px;height:28px;border-radius:50%;background:var(--blue);color:#fff;font-weight:700;font-size:13px;display:grid;place-items:center;}',
    '.fa-steps b{color:var(--ink);}',
    '.fa-kbd{display:inline-block;padding:0 6px;border-radius:6px;background:var(--paper);border:1px solid var(--line2);font-weight:600;font-size:13px;white-space:nowrap;}',
    '.fa-note{font-size:13px;padding:10px 12px;border-radius:12px;background:var(--paper);color:#3a3f5c;}',
    '.fa-sheet-actions{display:flex;flex-direction:column;gap:8px;}',
    '.fa-sheet-actions .fa-btn{justify-content:flex-start;}',
    '.fa-sheet-img{width:100%;max-height:44vh;object-fit:contain;border-radius:12px;background:#eceae3;}',
    /* menu */
    '.fa-menu{position:fixed;z-index:35;min-width:260px;padding:6px;border-radius:16px;background:#fff;box-shadow:var(--sh-lg);border:1px solid var(--line);animation:faMenuIn .2s var(--ease);transform-origin:top right;}',
    '.fa-menu button,.fa-menu a{display:flex;align-items:center;gap:10px;width:100%;min-height:46px;padding:0 12px;border-radius:10px;font-size:14.5px;font-weight:500;color:var(--ink);text-decoration:none;text-align:left;}',
    '.fa-menu button:hover,.fa-menu a:hover{background:var(--paper);}',
    '.fa-menu .fa-ic{color:var(--blue);}',
    '.fa-menu hr{border:0;border-top:1px solid var(--line);margin:4px 6px;}',
    '.fa-menu .danger,.fa-menu .danger .fa-ic{color:var(--red);}',
    /* loading */
    '.fa-loading{position:absolute;inset:0;display:grid;place-items:center;background:var(--ink);color:#fff;}',
    '.fa-loading .fa-logo-g{animation:faSpin 2.4s var(--ease) infinite;}',
    '.fa-loading p{margin-top:14px;color:rgba(255,255,255,.7);text-align:center;font-size:14px;}',
    /* login */
    '.fa-login{position:absolute;inset:0;overflow:auto;background:radial-gradient(90% 70% at 15% 0%,#1d2477 0%,rgba(29,36,119,0) 60%),radial-gradient(70% 60% at 100% 100%,rgba(248,176,64,.16) 0%,rgba(248,176,64,0) 60%),var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;padding:24px 16px;}',
    '.fa-ecg{position:absolute;left:0;right:0;top:50%;height:200px;transform:translateY(-50%);width:100%;pointer-events:none;opacity:.9;}',
    '.fa-ecg path{fill:none;stroke-linecap:round;stroke-linejoin:round;}',
    '.fa-ecg .base{stroke:rgba(255,255,255,.06);stroke-width:2;}',
    '.fa-ecg .beat{stroke:var(--red);stroke-width:2.5;stroke-dasharray:320 2400;stroke-dashoffset:320;filter:drop-shadow(0 0 6px rgba(230,57,70,.9));animation:faEcg 3.2s linear infinite;}',
    '.fa-ecg .beat2{stroke:var(--amber);stroke-width:1.5;opacity:.5;stroke-dasharray:200 2520;stroke-dashoffset:200;animation:faEcg 3.2s 1.6s linear infinite;}',
    '.fa-login-card{position:relative;width:min(420px,100%);padding:30px 26px 24px;border-radius:26px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(18px) saturate(1.3);-webkit-backdrop-filter:blur(18px) saturate(1.3);box-shadow:0 40px 100px -30px rgba(0,0,0,.7);animation:faModalIn .6s var(--ease);}',
    '.fa-login-logo{display:flex;justify-content:center;margin-bottom:14px;}',
    '.fa-login-logo .fa-logo-g{animation:faBeat 1.6s ease-in-out infinite;}',
    '.fa-login h1{text-align:center;font-size:24px;}',
    '.fa-login .fa-sub{text-align:center;color:rgba(255,255,255,.6);font-size:13px;margin-top:4px;}',
    '.fa-login h2{font-size:18px;margin:22px 0 12px;display:flex;align-items:center;gap:8px;}',
    '.fa-login form{display:flex;flex-direction:column;gap:12px;}',
    '.fa-login label{font-size:13px;font-weight:600;color:rgba(255,255,255,.85);display:flex;flex-direction:column;gap:6px;}',
    '.fa-login .fa-input{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);color:#fff;}',
    '.fa-login .fa-input::placeholder{color:rgba(255,255,255,.4);}',
    '.fa-login .fa-input:focus{border-color:var(--amber);box-shadow:0 0 0 4px rgba(248,176,64,.18);}',
    '.fa-pw{position:relative;}',
    '.fa-pw .fa-input{padding-right:48px;}',
    '.fa-pw .fa-ibtn{position:absolute;right:0;top:0;color:rgba(255,255,255,.6);}',
    '.fa-pw .fa-ibtn:hover{background:rgba(255,255,255,.08);color:#fff;}',
    '.fa-login .fa-btn-amber{margin-top:6px;}',
    '.fa-login-err{min-height:20px;font-size:13px;color:#ff9aa2;font-weight:600;}',
    '.fa-login-note{margin-top:16px;font-size:12.5px;color:rgba(255,255,255,.6);display:flex;gap:8px;align-items:flex-start;line-height:1.45;}',
    '.fa-login-note .fa-ic{width:16px;height:16px;flex:none;margin-top:1px;color:var(--amber);}',
    '.fa-linkbtn{align-self:center;color:rgba(255,255,255,.7);font-size:13px;text-decoration:underline;text-underline-offset:3px;min-height:44px;padding:0 8px;}',
    '.fa-linkbtn:hover{color:#fff;}',
    '.fa-shake{animation:faShake .4s;}',
    '.fa-login .fa-help-dark{font-size:13px;color:rgba(255,255,255,.75);background:rgba(230,57,70,.15);border:1px solid rgba(230,57,70,.4);border-radius:14px;padding:12px 14px;margin-top:14px;}',
    /* keyframes */
    '@keyframes faIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    '@keyframes faPop{0%{opacity:0;transform:scale(.94)}100%{opacity:1;transform:none}}',
    '@keyframes faOut{to{opacity:0;transform:translateX(-14px) scale(.98)}}',
    '@keyframes faFade{from{opacity:0}}',
    '@keyframes faFadeOut{to{opacity:0}}',
    '@keyframes faModalIn{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:none}}',
    '@keyframes faMenuIn{from{opacity:0;transform:scale(.95)}}',
    '@keyframes faToastIn{from{opacity:0;transform:translateY(14px) scale(.97)}}',
    '@keyframes faToastOut{to{opacity:0;transform:translateY(10px)}}',
    '@keyframes faDraw{to{stroke-dashoffset:0}}',
    '@keyframes faPulse{50%{opacity:.3}}',
    '@keyframes faRing{0%{box-shadow:0 0 0 0 rgba(32,176,114,.6)}70%{box-shadow:0 0 0 8px rgba(32,176,114,0)}100%{box-shadow:0 0 0 0 rgba(32,176,114,0)}}',
    '@keyframes faFlash{0%,40%{box-shadow:0 0 0 4px rgba(248,176,64,.9);background-color:#fff8e8}100%{box-shadow:0 0 0 0 rgba(248,176,64,0)}}',
    '@keyframes faEcg{to{stroke-dashoffset:-2400}}',
    '@keyframes faBeat{0%,40%,100%{transform:scale(1)}10%{transform:scale(1.08)}20%{transform:scale(.98)}30%{transform:scale(1.05)}}',
    '@keyframes faSpin{to{transform:rotate(360deg)}}',
    '@keyframes faShake{20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}',
    '@media (prefers-reduced-motion:reduce){.fa-admin *{animation-duration:.001s!important;animation-iteration-count:1!important;transition-duration:.001s!important;}}',
    /* medium widths */
    '@media (max-width:1180px) and (min-width:900px){.fa-main{grid-template-columns:76px 400px minmax(0,1fr);}.fa-hide-md{display:none!important;}}',
    /* phone layout */
    '@media (max-width:899px){',
    '.fa-admin{font-size:15px;}',
    '.fa-app{grid-template-rows:58px 52px minmax(0,1fr);}',
    '.fa-top{padding:0 8px 0 12px;gap:6px;}',
    '.fa-brand-t small{display:none;}',
    '.fa-hide-sm{display:none!important;}',
    '.fa-show-sm{display:inline;}',
    '.fa-main{grid-template-columns:minmax(0,1fr);}',
    '.fa-rail{display:none;}',
    '.fa-tabs{display:flex;gap:4px;padding:5px 12px;background:rgba(255,255,255,.82);border-bottom:1px solid var(--line);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);}',
    '.fa-tabs button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;border-radius:11px;font-weight:600;color:var(--muted);transition:background .2s,color .2s;}',
    '.fa-tabs button[aria-selected="true"]{background:var(--blue);color:#fff;box-shadow:0 6px 14px -8px rgba(40,48,144,.8);}',
    '.fa-app[data-view="edit"] .fa-preview{display:none;}',
    '.fa-app[data-view="preview"] .fa-editor{display:none;}',
    '.fa-editor{border-right:0;}',
    '.fa-ed-head{padding:10px 12px 8px;}',
    '.fa-ed-body{padding:14px 12px 110px;}',
    '.fa-pv-bar .fa-seg{display:none;}',
    '.fa-pv-stage{padding:0;}',
    '.fa-pv-wrap,.fa-pv-wrap.phone,.fa-pv-wrap.tablet{border-radius:0;box-shadow:none;}',
    '.fa-grip{display:none;}',
    '.fa-card-head{padding-left:8px;}',
    '.fa-modal-ov{align-items:flex-end;padding:0;}',
    '.fa-modal,.fa-modal.wide{width:100%;max-height:92dvh;border-radius:22px 22px 0 0;animation:faSheetIn .32s var(--ease);}',
    '.fa-modal-foot{padding-bottom:max(20px,env(safe-area-inset-bottom));}',
    '.fa-modal-foot .fa-btn{flex:1 1 auto;}',
    '.fa-menu{left:8px!important;right:8px!important;top:auto!important;bottom:8px!important;min-width:0;transform-origin:bottom center;padding:8px 8px max(8px,env(safe-area-inset-bottom));border-radius:20px;}',
    '.fa-toasts{bottom:max(14px,env(safe-area-inset-bottom));}',
    '.fa-img-prev{width:80px;height:64px;}',
    '.fa-save-time{display:none;}',
    '}',
    '@media (max-width:420px){.fa-rowi .fa-num{display:none;}.fa-tiles{grid-template-columns:1fr 1fr;}.fa-tile{padding:12px;min-height:96px;}.fa-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}',
    '@keyframes faSheetIn{from{transform:translateY(40px);opacity:0}}'
  ].join('\n');

  function injectStyles() {
    if (document.getElementById('fa-admin-style')) return;
    var st = document.createElement('style');
    st.id = 'fa-admin-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ------------------------------------------------------------------ */
  /* Toasts                                                              */
  /* ------------------------------------------------------------------ */
  function toast(msg, opts) {
    opts = opts || {};
    var host = S.els.toasts;
    if (!host) { host = S.els.toasts = h('div', { class: 'fa-toasts', role: 'status', 'aria-live': 'polite' }); S.root.appendChild(host); }
    var kind = opts.kind || 'ok';
    var ic = icon(kind === 'ok' ? 'check' : kind === 'warn' ? 'alert' : 'alert', 'fa-tic');
    var t = h('div', { class: 'fa-toast ' + kind }, ic, h('div', { class: 'fa-toast-msg', text: msg }));
    function close() { if (!t.parentNode) return; t.classList.add('out'); setTimeout(function () { t.remove(); }, 200); }
    if (opts.action) {
      t.appendChild(h('button', { class: 'fa-btn', type: 'button', text: opts.action.label, onclick: function () { close(); opts.action.fn(); } }));
    }
    t.appendChild(h('button', { class: 'fa-ibtn', type: 'button', 'aria-label': 'Dismiss', onclick: close }, icon('x')));
    host.appendChild(t);
    while (host.children.length > 3) host.firstChild.remove();
    setTimeout(close, opts.timeout || (opts.action ? 8000 : 3200));
    return close;
  }

  /* ------------------------------------------------------------------ */
  /* Modal                                                               */
  /* ------------------------------------------------------------------ */
  function modal(o) {
    return new Promise(function (resolve) {
      var prev = document.activeElement;
      var titleId = nextId('mt');
      var ov = h('div', { class: 'fa-modal-ov' });
      var box = h('div', { class: 'fa-modal' + (o.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });
      var done = false;
      function close(v) {
        if (done) return; done = true;
        ov.classList.add('out');
        document.removeEventListener('keydown', onKey, true);
        setTimeout(function () { ov.remove(); }, 170);
        if (prev && prev.focus && document.contains(prev)) { try { prev.focus({ preventScroll: true }); } catch (e) { } }
        resolve(v);
      }
      var head = h('div', { class: 'fa-modal-head' },
        o.icon ? icon(o.icon, 'fa-modal-ic ' + (o.tone || '')) : null,
        h('h2', { id: titleId, text: o.title }),
        o.dismissible === false ? null : h('button', { class: 'fa-ibtn', type: 'button', 'aria-label': 'Close', onclick: function () { close(null); } }, icon('x')));
      var body = h('div', { class: 'fa-modal-body' });
      if (typeof o.body === 'string') body.appendChild(h('p', { text: o.body })); else append(body, o.body);
      box.appendChild(head); box.appendChild(body);
      if (o.actions && o.actions.length) {
        var foot = h('div', { class: 'fa-modal-foot' });
        o.actions.forEach(function (a) {
          foot.appendChild(h('button', {
            class: 'fa-btn fa-btn-' + (a.kind || 'ghost'), type: 'button', 'data-autofocus': a.autofocus ? '1' : null,
            onclick: function () {
              if (a.onClick) { var r = a.onClick(close); if (r === false) return; }
              close(a.value);
            }
          }, a.icon ? icon(a.icon) : null, a.label));
        });
        box.appendChild(foot);
      }
      ov.appendChild(box);
      ov.addEventListener('mousedown', function (e) { if (e.target === ov && o.dismissible !== false) close(null); });
      function onKey(e) {
        if (e.key === 'Escape' && o.dismissible !== false) { e.stopPropagation(); close(null); }
        if (e.key === 'Tab') {
          var f = Array.prototype.filter.call(box.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'), function (x) { return !x.disabled && x.offsetParent !== null; });
          if (!f.length) return;
          if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
      }
      document.addEventListener('keydown', onKey, true);
      S.root.appendChild(ov);
      if (o.onOpen) o.onOpen(close, box);
      setTimeout(function () {
        var af = box.querySelector('[data-autofocus="1"]') || box.querySelector('input,select,textarea') || box.querySelector('.fa-modal-foot .fa-btn-primary,.fa-modal-foot .fa-btn-amber') || box.querySelector('button');
        if (af) try { af.focus({ preventScroll: true }); } catch (e) { }
      }, 30);
    });
  }
  function confirmModal(title, text, okLabel, tone) {
    return modal({ title: title, body: text, icon: tone === 'danger' ? 'alert' : 'help', tone: tone || '', actions: [{ label: 'Cancel', value: false }, { label: okLabel || 'OK', value: true, kind: tone === 'danger' ? 'danger' : 'primary', autofocus: true }] });
  }
  function promptModal(title, label, placeholder) {
    var inp = h('input', { class: 'fa-input', type: 'text', placeholder: placeholder || '', 'aria-label': label });
    return modal({
      title: title, icon: 'plus',
      body: [h('label', { class: 'fa-field' }, h('span', { class: 'fa-label', text: label }), inp)],
      onOpen: function (close) { inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); close(inp.value.trim() || null); } }); },
      actions: [{ label: 'Cancel', value: null }, { label: 'Add', kind: 'primary', onClick: function (close) { close(inp.value.trim() || null); return false; } }]
    });
  }

  /* ------------------------------------------------------------------ */
  /* IndexedDB                                                           */
  /* ------------------------------------------------------------------ */
  var dbP = null;
  function idb() {
    if (dbP) return dbP;
    dbP = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('IndexedDB not available')); return; }
      var r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(IDB_STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    dbP.catch(function () { dbP = null; });
    return dbP;
  }
  function idbReq(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(IDB_STORE, mode);
        var st = tx.objectStore(IDB_STORE);
        var q = fn(st);
        tx.oncomplete = function () { res(q && q.result); };
        tx.onerror = function () { rej(tx.error); };
        tx.onabort = function () { rej(tx.error); };
      });
    });
  }
  function idbGet(k) { return idbReq('readonly', function (st) { return st.get(k); }); }
  function idbSet(k, v) { return idbReq('readwrite', function (st) { return st.put(v, k); }); }
  function idbDel(k) { return idbReq('readwrite', function (st) { return st.delete(k); }); }

  /* ------------------------------------------------------------------ */
  /* Auth                                                                */
  /* ------------------------------------------------------------------ */
  function getCred() { try { var c = JSON.parse(localStorage.getItem(CRED_KEY) || 'null'); return c && c.id && c.hash && c.salt ? c : null; } catch (e) { return null; } }
  function isLoggedIn() {
    var c = getCred(); if (!c) return false;
    try { var s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); return !!(s && s.id === c.id); } catch (e) { return false; }
  }
  function derive(password, salt, iterations) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']).then(function (key) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations }, key, 256);
    });
  }
  function eqConst(a, b) { if (a.length !== b.length) return false; var r = 0; for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
  function cryptoOK() { return !!(window.crypto && window.crypto.subtle && window.TextEncoder && window.isSecureContext !== false); }

  function renderNoCrypto() {
    S.root.innerHTML = '';
    var card = h('div', { class: 'fa-login-card' },
      h('div', { class: 'fa-login-logo' }, logoMark(76, 'on-dark')),
      h('h1', { text: 'Site admin' }),
      h('div', { class: 'fa-help-dark' },
        h('b', { text: 'This browser can’t run the secure login here.' }),
        h('p', { style: { marginTop: '6px' }, text: 'The login needs a secure (https://) connection. Open the admin on your live address, for example https://your-site.vercel.app/#admin, in an up-to-date Chrome, Edge, Safari or Firefox.' })),
      h('button', { class: 'fa-btn fa-btn-ghost fa-btn-block', style: { marginTop: '16px', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }, type: 'button', onclick: exitAdmin }, icon('left'), 'Back to the website'));
    S.root.appendChild(h('div', { class: 'fa-login' }, ecgSvg(), card));
  }

  function ecgSvg() {
    var seg = function (x) { return ' H' + (x) + ' l14 0 l10 -14 l10 26 l12 -82 l14 128 l12 -66 l10 8 l10 0'; };
    var d = 'M0 100'; for (var x = 120; x < 2400; x += 400) d += seg(x); d += ' H2400';
    var w = document.createElement('div');
    w.innerHTML = '<svg class="fa-ecg" viewBox="0 0 1200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path class="base" d="' + d + '"/><path class="beat" d="' + d + '"/><path class="beat2" d="' + d + '"/></svg>';
    return w.firstChild;
  }

  function renderLogin(mode) {
    S.root.innerHTML = ''; S.els = {};
    var cred = getCred();
    mode = mode || (cred ? 'login' : 'create');
    var err = h('div', { class: 'fa-login-err', role: 'alert' });
    var idIn = h('input', { class: 'fa-input', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true, placeholder: mode === 'create' ? 'Choose an ID, e.g. admin' : 'Your admin ID' });
    function pwBox(ph, ac) {
      var inp = h('input', { class: 'fa-input', type: 'password', autocomplete: ac, required: true, placeholder: ph });
      var tg = h('button', { class: 'fa-ibtn', type: 'button', 'aria-label': 'Show password' }, icon('eye'));
      tg.addEventListener('click', function () {
        var show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
        tg.innerHTML = ''; tg.appendChild(icon(show ? 'eyeoff' : 'eye')); tg.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      });
      return { inp: inp, el: h('div', { class: 'fa-pw' }, inp, tg) };
    }
    var pw = pwBox(mode === 'create' ? 'At least 8 characters' : 'Your password', mode === 'create' ? 'new-password' : 'current-password');
    var pw2 = mode === 'create' ? pwBox('Type it again', 'new-password') : null;
    var submit = h('button', { class: 'fa-btn fa-btn-amber fa-btn-lg fa-btn-block', type: 'submit' }, icon(mode === 'create' ? 'check' : 'lock'), mode === 'create' ? 'Create login' : 'Log in');
    var form = h('form', { novalidate: true },
      h('label', null, 'Admin ID', idIn),
      h('label', null, 'Password', pw.el),
      pw2 ? h('label', null, 'Confirm password', pw2.el) : null,
      err, submit);
    var card = h('div', { class: 'fa-login-card' },
      h('div', { class: 'fa-login-logo' }, logoMark(84, 'on-dark')),
      h('h1', { text: 'First Aid Centre of Sweden' }),
      h('p', { class: 'fa-sub', text: 'Bangladesh · Website admin' }),
      h('h2', null, icon(mode === 'create' ? 'sparkle' : 'lock'), mode === 'create' ? 'Create your admin login' : 'Welcome back'),
      mode === 'create' ? h('p', { style: { fontSize: '13px', color: 'rgba(255,255,255,.7)', margin: '-4px 0 14px' }, text: 'First time on this device. Pick an ID and a password you will remember.' }) : null,
      form,
      mode === 'login' ? h('button', { class: 'fa-linkbtn', type: 'button', style: { display: 'block', margin: '8px auto 0' }, onclick: resetLogin, text: 'Forgot? Reset login on this device' }) : null,
      h('p', { class: 'fa-login-note' }, icon('shield'), 'This login stops casual visitors. The real protection is that only you can publish changes to GitHub.'),
      h('button', { class: 'fa-linkbtn', type: 'button', style: { display: 'block', margin: '4px auto 0' }, onclick: exitAdmin, text: '← Back to the website' }));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = '';
      var id = idIn.value.trim(), p = pw.inp.value;
      function fail(m) { err.textContent = m; card.classList.remove('fa-shake'); void card.offsetWidth; card.classList.add('fa-shake'); }
      if (!id) return fail('Please type an ID.');
      if (mode === 'create') {
        if (p.length < 8) return fail('Password must be at least 8 characters.');
        if (p !== pw2.inp.value) return fail('The two passwords don’t match.');
      } else if (!p) return fail('Please type your password.');
      submit.disabled = true; var oldTxt = submit.lastChild.textContent; submit.lastChild.textContent = mode === 'create' ? 'Creating…' : 'Checking…';
      var done = function () { submit.disabled = false; submit.lastChild.textContent = oldTxt; };
      if (mode === 'create') {
        var salt = crypto.getRandomValues(new Uint8Array(16));
        derive(p, salt, ITERATIONS).then(function (bits) {
          localStorage.setItem(CRED_KEY, JSON.stringify({ id: id, salt: b64(salt), hash: b64(bits), iterations: ITERATIONS }));
          sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: id, at: Date.now() }));
          boot(true);
        }).catch(function (ex) { done(); fail('Couldn’t create the login: ' + (ex && ex.message || ex)); });
      } else {
        var c = getCred();
        derive(p, unb64(c.salt), c.iterations || ITERATIONS).then(function (bits) {
          if (id === c.id && eqConst(b64(bits), c.hash)) {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: id, at: Date.now() }));
            boot(false);
          } else { done(); fail('ID or password is incorrect.'); pw.inp.select(); }
        }).catch(function (ex) { done(); fail('Login failed: ' + (ex && ex.message || ex)); });
      }
    });
    S.root.appendChild(h('div', { class: 'fa-login' }, ecgSvg(), card));
    setTimeout(function () { idIn.focus(); }, 50);
  }

  function resetLogin() {
    confirmModal('Reset the login on this device?', 'This removes the saved admin ID and password from this browser only. Your unsaved draft stays. You will create a new login straight away.', 'Reset login', 'danger').then(function (ok) {
      if (!ok) return;
      localStorage.removeItem(CRED_KEY); sessionStorage.removeItem(SESSION_KEY);
      renderLogin('create');
      toast('Login removed. Create a new one.', { kind: 'warn' });
    });
  }
  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    flushSave();
    document.removeEventListener('keydown', globalKeys);
    renderLogin('login');
    toast('Logged out. Your draft is saved on this device.');
  }
  function exitAdmin() {
    flushSave();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
    location.reload();
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */
  function fetchLive() {
    return fetch('content.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function renderLoading(msg) {
    S.root.innerHTML = ''; S.els = {};
    S.root.appendChild(h('div', { class: 'fa-loading' }, h('div', { style: { textAlign: 'center' } }, logoMark(72, 'on-dark'), h('p', { text: msg || 'Loading your website content…' }))));
  }
  function boot(isNew) {
    renderLoading();
    var live = null, rec = null;
    fetchLive().then(function (j) { live = j; }, function (e) { S.liveError = e; })
      .then(function () { return idbGet(DRAFT_KEY).then(function (r) { rec = r; }, function () { }); })
      .then(function () {
        S.live = live;
        if (rec && rec.content && isObj(rec.content)) {
          if (!live || !sameContent(rec.content, live)) {
            if (!live) { S.draft = rec.content; S.savedAt = rec.savedAt; return; }
            return modal({
              title: 'You have an unpublished draft', icon: 'restore', dismissible: false,
              body: [h('p', { text: 'You were editing on this device. Your draft was saved ' + timeStr(rec.savedAt) + '.' }),
                h('p', { class: 'fa-note', text: 'Choose “Start from live site” only if you want to throw the draft away and begin again from what is on the website now.' })],
              actions: [{ label: 'Start from live site', value: 'live', icon: 'globe' }, { label: 'Continue your draft (saved ' + timeStr(rec.savedAt) + ')', value: 'draft', kind: 'primary', icon: 'edit', autofocus: true }]
            }).then(function (v) {
              if (v === 'draft') { S.draft = rec.content; S.savedAt = rec.savedAt; toast('Draft restored'); }
              else { S.draft = clone(live); idbDel(DRAFT_KEY).catch(function () { }); toast('Started from the live site'); }
            });
          }
        }
        if (live) { S.draft = clone(live); return; }
      })
      .then(function () {
        if (!S.draft) { renderNoContent(); return; }
        renderApp();
        if (isNew) toast('Login created. Welcome!');
        if (S.liveError) toast('Couldn’t load the live content.json (' + S.liveError.message + '). Working from your draft.', { kind: 'warn', timeout: 7000 });
      });
  }
  function renderNoContent() {
    S.root.innerHTML = '';
    var box = h('div', { class: 'fa-login' }, h('div', { class: 'fa-login-card' },
      h('div', { class: 'fa-login-logo' }, logoMark(70, 'on-dark')),
      h('h1', { text: 'Couldn’t load content.json' }),
      h('p', { class: 'fa-sub', text: (S.liveError && S.liveError.message) || 'Unknown error' }),
      h('div', { style: { display: 'grid', gap: '10px', marginTop: '20px' } },
        h('button', { class: 'fa-btn fa-btn-amber fa-btn-lg', type: 'button', onclick: function () { boot(false); } }, icon('refresh'), 'Try again'),
        h('button', { class: 'fa-btn fa-btn-ghost', style: { color: '#fff', borderColor: 'rgba(255,255,255,.25)' }, type: 'button', onclick: function () { pickImport(true); } }, icon('fileup'), 'Open a content.json file'),
        h('button', { class: 'fa-linkbtn', type: 'button', onclick: logout, text: 'Log out' }))));
    S.root.appendChild(box);
  }

  /* ------------------------------------------------------------------ */
  /* App shell                                                           */
  /* ------------------------------------------------------------------ */
  function renderApp() {
    S.root.innerHTML = ''; S.els = {};
    var E = S.els;
    E.app = h('div', { class: 'fa-app', 'data-view': S.view });

    // Top bar
    E.moreBtn = h('button', { class: 'fa-ibtn', type: 'button', 'aria-label': 'More actions', 'aria-haspopup': 'menu', onclick: function (e) { e.stopPropagation(); openMenu(E.moreBtn); } }, icon('more'));
    var top = h('header', { class: 'fa-top' },
      h('div', { class: 'fa-brand' }, logoMark(36),
        h('div', { class: 'fa-brand-t' }, h('b', { text: 'Site editor' }), h('small', { text: 'First Aid Centre of Sweden, Bangladesh' }))),
      h('div', { class: 'fa-top-actions' },
        h('button', { class: 'fa-btn fa-btn-ghost fa-hide-sm fa-hide-md', type: 'button', onclick: showPublishHelp }, icon('help'), 'How to publish'),
        h('button', { class: 'fa-btn fa-btn-ghost fa-hide-sm', type: 'button', onclick: function () { pickImport(false); } }, icon('fileup'), 'Import'),
        h('button', { class: 'fa-btn fa-btn-primary', type: 'button', id: 'fa-download', onclick: downloadFlow }, icon('download'), h('span', { class: 'fa-hide-sm', text: 'Download content.json' }), h('span', { class: 'fa-show-sm', text: 'Download' })),
        E.moreBtn));

    // Phone tabs
    E.tabEdit = h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', onclick: function () { setView('edit'); } }, icon('edit'), 'Edit');
    E.tabPrev = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', onclick: function () { setView('preview'); } }, icon('eye'), 'Preview');
    var tabs = h('nav', { class: 'fa-tabs', role: 'tablist', 'aria-label': 'Edit or preview' }, E.tabEdit, E.tabPrev);

    // Rail
    E.rail = h('nav', { class: 'fa-rail', 'aria-label': 'Sections' });
    // Editor
    E.search = h('input', { type: 'search', placeholder: 'Search all fields… (e.g. phone, CPR)', 'aria-label': 'Search all fields', autocomplete: 'off' });
    E.searchClear = h('button', { class: 'fa-ibtn fa-hidden', type: 'button', 'aria-label': 'Clear search', onclick: function () { E.search.value = ''; onSearch(); E.search.focus(); } }, icon('x'));
    E.search.addEventListener('input', function () { debounce('search', onSearch, 180); });
    E.search.addEventListener('keydown', function (e) { if (e.key === 'Escape') { E.search.value = ''; onSearch(); } });
    E.sizeChip = h('button', { class: 'fa-chip-size', type: 'button', onclick: showSizeDetails, title: 'File size details' }, icon('weight'), h('span', { text: 'content.json · …' }));
    E.save = h('span', { class: 'fa-save', 'aria-live': 'polite' });
    E.unpub = h('span', { class: 'fa-unpub fa-hidden', title: 'Your changes are not on the website until you download and upload content.json' }, h('span', { class: 'fa-dot' }), 'Not published yet');
    E.sizeWarn = h('div', { class: 'fa-sizewarn fa-hidden' });
    E.body = h('div', { class: 'fa-ed-body', id: 'fa-ed-body' });
    var editor = h('section', { class: 'fa-editor', 'aria-label': 'Editor' },
      h('div', { class: 'fa-ed-head' },
        h('div', { class: 'fa-search' }, icon('search'), E.search, E.searchClear),
        h('div', { class: 'fa-status' }, E.sizeChip, E.save, E.unpub),
        E.sizeWarn),
      E.body);

    // Preview
    E.iframe = S.iframe = h('iframe', { title: 'Live preview of the website', src: window.FA_ADMIN_PREVIEW_SRC || './?preview=1', loading: 'eager' });
    E.pvWrap = h('div', { class: 'fa-pv-wrap' }, E.iframe);
    E.pvStage = h('div', { class: 'fa-pv-stage' }, E.pvWrap);
    var seg = h('div', { class: 'fa-seg', role: 'group', 'aria-label': 'Preview size' });
    [['desktop', 'Desktop'], ['tablet', 'Tablet'], ['phone', 'Phone']].forEach(function (d) {
      seg.appendChild(h('button', { type: 'button', 'aria-pressed': String(S.device === d[0]), 'data-device': d[0], onclick: function () { setDevice(d[0]); } }, icon(d[0] === 'phone' ? 'mobile' : d[0]), h('span', { class: 'fa-hide-md', text: d[1] })));
    });
    E.seg = seg;
    var pvBar = h('div', { class: 'fa-pv-bar' },
      h('span', { class: 'fa-pv-label' }, h('span', { class: 'fa-pv-live' }), 'Live preview (not published)'),
      seg,
      h('div', { style: { display: 'flex', gap: '4px' } },
        h('button', { class: 'fa-ibtn', type: 'button', 'aria-label': 'Reload preview', title: 'Reload preview', onclick: function () { S.previewReady = false; E.iframe.src = E.iframe.src; } }, icon('refresh')),
        h('a', { class: 'fa-ibtn', href: './', target: '_blank', rel: 'noopener', 'aria-label': 'View site in a new tab', title: 'View site' }, icon('external'))));
    var preview = h('section', { class: 'fa-preview', 'aria-label': 'Preview' }, pvBar, E.pvStage);

    var main = h('div', { class: 'fa-main' }, E.rail, editor, preview);
    E.app.appendChild(top); E.app.appendChild(tabs); E.app.appendChild(main);
    S.root.appendChild(E.app);
    E.toasts = h('div', { class: 'fa-toasts', role: 'status', 'aria-live': 'polite' });
    S.root.appendChild(E.toasts);

    E.iframe.addEventListener('load', function () { sendPreview(); });
    renderRail();
    renderEditor();
    setSaveState(S.savedAt ? 'saved' : 'idle');
    updateStatus();
    setView(S.view);
    fitPreview();
    if (window.ResizeObserver) { new ResizeObserver(function () { fitPreview(); }).observe(E.pvStage); }
    document.addEventListener('keydown', globalKeys);
  }
  function globalKeys(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flushSave(); toast('Draft saved on this device. Use “Download content.json” to publish.'); }
  }

  function sectionKeys() {
    var keys = SECTION_ORDER.filter(function (k) { return S.draft && k in S.draft; });
    Object.keys(S.draft || {}).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    return keys;
  }
  function secInfo(k) { return SECTIONS[k] || { label: friendlyKey(k), icon: 'layout', desc: '' }; }

  function renderRail() {
    var r = S.els.rail; r.innerHTML = '';
    r.appendChild(h('button', { class: 'fa-rail-btn', type: 'button', 'aria-current': String(!S.section && !S.search), onclick: function () { openSection(null); } }, icon('home'), 'Start'));
    r.appendChild(h('div', { class: 'fa-rail-sep' }));
    sectionKeys().forEach(function (k) {
      var info = secInfo(k);
      r.appendChild(h('button', { class: 'fa-rail-btn', type: 'button', 'data-sec': k, 'aria-current': String(S.section === k && !S.search), onclick: function () { openSection(k); } }, icon(info.icon), info.label));
    });
  }
  function updateRail() {
    Array.prototype.forEach.call(S.els.rail.querySelectorAll('.fa-rail-btn'), function (b) {
      var k = b.getAttribute('data-sec');
      b.setAttribute('aria-current', String(!S.search && ((k && k === S.section) || (!k && !S.section))));
    });
  }
  function setView(v) {
    S.view = v;
    if (!S.els.app) return;
    S.els.app.setAttribute('data-view', v);
    S.els.tabEdit.setAttribute('aria-selected', String(v === 'edit'));
    S.els.tabPrev.setAttribute('aria-selected', String(v === 'preview'));
    if (v === 'preview') { requestAnimationFrame(fitPreview); sendPreview(); if (S.section) postScroll(S.section); }
  }
  function setDevice(d) {
    S.device = d;
    Array.prototype.forEach.call(S.els.seg.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-device') === d)); });
    fitPreview();
  }
  function fitPreview() {
    var E = S.els; if (!E.pvStage) return;
    var rect = E.pvStage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var phone = isPhoneLayout();
    var pad = phone ? 0 : 32;
    var availW = rect.width - pad, availH = rect.height - pad;
    var dev = phone ? 'fill' : S.device;
    var devW = dev === 'fill' ? availW : dev === 'phone' ? 390 : dev === 'tablet' ? 820 : 1280;
    if (dev !== 'fill' && dev !== 'desktop') { availW -= 16; availH -= 16; }
    var scale = Math.min(1, availW / devW);
    var wrapW = Math.round(devW * scale);
    var wrapH = dev === 'phone' ? Math.min(availH, Math.round(844 * scale)) : availH;
    E.pvWrap.className = 'fa-pv-wrap' + (dev === 'phone' ? ' phone' : dev === 'tablet' ? ' tablet' : '');
    E.pvWrap.style.width = wrapW + 'px';
    E.pvWrap.style.height = wrapH + 'px';
    E.pvWrap.style.marginTop = (dev === 'phone' || dev === 'tablet') ? '8px' : '0';
    E.iframe.style.width = devW + 'px';
    E.iframe.style.height = Math.round(wrapH / scale) + 'px';
    E.iframe.style.transform = scale < 1 ? 'scale(' + scale + ')' : 'none';
  }

  /* menu */
  function openMenu(anchor) {
    if (S.els.menu) { closeMenu(); return; }
    var items = [
      ['help', 'How to publish', showPublishHelp],
      ['fileup', 'Import / restore a content.json', function () { pickImport(false); }],
      ['restore', 'Add items from live site', addFromLiveTool],
      ['weight', 'File size & biggest photos', showSizeDetails],
      null,
      ['external', 'View site', function () { window.open('./', '_blank', 'noopener'); }],
      ['left', 'Exit admin', exitAdmin],
      ['logout', 'Log out', logout, 'danger']
    ];
    var m = h('div', { class: 'fa-menu', role: 'menu' });
    items.forEach(function (it) {
      if (!it) { m.appendChild(h('hr')); return; }
      m.appendChild(h('button', { type: 'button', role: 'menuitem', class: it[3] || null, onclick: function () { closeMenu(); it[2](); } }, icon(it[0]), it[1]));
    });
    var r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + 'px';
    m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    S.root.appendChild(m);
    S.els.menu = m;
    anchor.setAttribute('aria-expanded', 'true');
    setTimeout(function () { var f = m.querySelector('button'); if (f) f.focus(); }, 20);
    S.menuOff = function (e) { if (!m.contains(e.target)) closeMenu(); };
    S.menuKey = function (e) {
      if (e.key === 'Escape') { closeMenu(); anchor.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var bs = Array.prototype.slice.call(m.querySelectorAll('button')); var i = bs.indexOf(document.activeElement);
        i = e.key === 'ArrowDown' ? (i + 1) % bs.length : (i - 1 + bs.length) % bs.length; bs[i].focus();
      }
    };
    setTimeout(function () { document.addEventListener('click', S.menuOff); document.addEventListener('keydown', S.menuKey); }, 0);
  }
  function closeMenu() {
    if (!S.els.menu) return;
    S.els.menu.remove(); S.els.menu = null;
    if (S.els.moreBtn) S.els.moreBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', S.menuOff); document.removeEventListener('keydown', S.menuKey);
  }

  /* ------------------------------------------------------------------ */
  /* Change tracking, autosave, preview, status                          */
  /* ------------------------------------------------------------------ */
  function changed() {
    setSaveState('saving');
    debounce('save', saveDraft, 450);
    debounce('preview', sendPreview, 400);
    debounce('status', updateStatus, 700);
  }
  function saveDraft() {
    if (!S.draft) return Promise.resolve();
    var t = Date.now();
    return idbSet(DRAFT_KEY, { content: S.draft, savedAt: t }).then(function () { S.savedAt = t; setSaveState('saved'); }, function (e) {
      setSaveState('error');
      if (!S.saveErrShown) { S.saveErrShown = true; toast('Couldn’t save the draft on this device (' + (e && e.message || 'storage blocked') + '). Download content.json to keep your work.', { kind: 'err', timeout: 9000 }); }
    });
  }
  function flushSave() { if (S.timers.save) { clearTimeout(S.timers.save); S.timers.save = null; if (S.draft && S.saveState === 'saving') saveDraft(); } }
  function setSaveState(st) {
    S.saveState = st;
    var el = S.els.save; if (!el) return;
    el.className = 'fa-save ' + st; el.innerHTML = '';
    if (st === 'saving') { el.appendChild(h('span', { class: 'fa-dot' })); el.appendChild(document.createTextNode('Saving draft…')); }
    else if (st === 'saved') { el.appendChild(document.createTextNode('Draft saved')); el.appendChild(icon('check')); if (S.savedAt) el.appendChild(h('span', { class: 'fa-save-time', style: { opacity: '.7' }, text: shortTime(S.savedAt) })); el.title = 'Saved on this device ' + timeStr(S.savedAt || Date.now()); }
    else if (st === 'error') { el.appendChild(icon('alert')); el.appendChild(document.createTextNode('Draft not saved')); }
    else { el.appendChild(document.createTextNode('No changes yet')); }
  }
  function sendPreview() {
    var w = S.iframe && S.iframe.contentWindow; if (!w || !S.draft) return;
    try { w.postMessage({ type: 'fa:content', content: S.draft }, '*'); } catch (e) { }
  }
  function postScroll(key) {
    if (PREVIEW_IDS.indexOf(key) < 0) return;
    var w = S.iframe && S.iframe.contentWindow; if (!w) return;
    try { w.postMessage({ type: 'fa:scrollTo', target: key }, '*'); } catch (e) { }
  }
  window.addEventListener('message', function (e) {
    if (!S.iframe || e.source !== S.iframe.contentWindow) return;
    var d = e.data;
    if (d && d.type === 'fa:ready') { S.previewReady = true; sendPreview(); if (S.section) setTimeout(function () { postScroll(S.section); }, 60); }
  });
  function jsonText() { return JSON.stringify(S.draft, null, 2) + '\n'; }
  function updateStatus() {
    var E = S.els; if (!E.sizeChip || !S.draft) return;
    var bytes = new Blob([jsonText()]).size; S.bytes = bytes;
    var lvl = bytes > DANGER_BYTES ? 'danger' : bytes > WARN_BYTES ? 'warn' : '';
    E.sizeChip.className = 'fa-chip-size ' + lvl;
    E.sizeChip.lastChild.textContent = 'content.json · ' + fmtBytes(bytes);
    E.sizeWarn.className = 'fa-sizewarn ' + (lvl ? lvl : 'fa-hidden');
    E.sizeWarn.textContent = lvl === 'danger' ? 'Too large: GitHub web upload limit is 25 MB; remove photos.' : lvl === 'warn' ? 'Large: pages load slower; consider fewer/smaller photos.' : '';
    E.unpub.classList.toggle('fa-hidden', !S.live || sameContent(S.draft, S.live));
  }

  /* ------------------------------------------------------------------ */
  /* Editor rendering                                                    */
  /* ------------------------------------------------------------------ */
  function onSearch() {
    var q = S.els.search.value.trim();
    S.search = q;
    S.els.searchClear.classList.toggle('fa-hidden', !q);
    renderEditor();
    S.els.body.scrollTop = 0;
    updateRail();
  }
  function openSection(k, keepSearch) {
    S.section = k;
    if (!keepSearch) { S.search = ''; if (S.els.search) { S.els.search.value = ''; S.els.searchClear.classList.add('fa-hidden'); } }
    renderEditor();
    S.els.body.scrollTop = 0;
    updateRail();
    if (k) postScroll(k);
    if (isPhoneLayout()) setView('edit');
  }
  function rerender(focusSel) {
    var body = S.els.body; if (!body) return;
    var st = body.scrollTop;
    renderEditor(true);
    body.scrollTop = st;
    if (focusSel) { var f = body.querySelector(focusSel); if (f) try { f.focus({ preventScroll: true }); } catch (e) { } }
  }
  function renderEditor(noAnim) {
    var body = S.els.body; body.innerHTML = '';
    var wrap = h('div', { class: noAnim ? '' : 'fa-anim-in' });
    if (S.search) renderSearch(wrap);
    else if (!S.section || !(S.section in S.draft)) { S.section = null; renderHome(wrap); }
    else renderSection(wrap, S.section);
    body.appendChild(wrap);
    if (S.justAdded) {
      var el = body.querySelector('.fa-enter');
      S.justAdded = null;
      if (el) setTimeout(function () {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        var inp = el.querySelector('.fa-card-body input:not([type=file]):not([type=color]),.fa-card-body textarea');
        if (inp) try { inp.focus({ preventScroll: true }); } catch (e) { }
      }, 30);
    }
  }

  function mainListCount(k) {
    var v = S.draft[k];
    if (Array.isArray(v)) return v.length + ' ' + (v.length === 1 ? 'item' : 'items');
    var info = SECTIONS[k]; if (!info || !info.list) return '';
    var arr = getIn(v, info.list.split('.'));
    if (!Array.isArray(arr)) return '';
    var name = labelFor([k].concat(info.list.split('.'))).toLowerCase();
    if (k === 'gallery') {
      var photos = arr.reduce(function (n, a) { return n + ((a && a.images && a.images.length) || 0); }, 0);
      return arr.length + ' albums · ' + photos + ' photos';
    }
    return arr.length + ' ' + name;
  }
  function renderHome(wrap) {
    wrap.appendChild(h('div', { class: 'fa-welcome' }, logoMark(150),
      h('h2', { text: 'Edit your website' }),
      h('p', { text: 'Every change appears in the preview right away and is saved on this device as a draft.' }),
      h('ol', null,
        h('li', { text: 'Pick a section below and change text or photos.' }),
        h('li', { text: 'Check the live preview.' }),
        h('li', null, h('span', null, 'Press ', h('b', { text: 'Download content.json' }), ' and upload it to GitHub to publish.')))));
    wrap.appendChild(h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' } },
      h('button', { class: 'fa-btn fa-btn-soft', type: 'button', onclick: function () { openSection('gallery'); } }, icon('image'), 'Add photos to the gallery'),
      h('button', { class: 'fa-btn fa-btn-ghost', type: 'button', onclick: showPublishHelp }, icon('help'), 'How to publish')));
    wrap.appendChild(h('h3', { class: 'fa-h-sub', text: 'Sections' }));
    var tiles = h('div', { class: 'fa-tiles' });
    sectionKeys().forEach(function (k) {
      var info = secInfo(k);
      var cnt = mainListCount(k);
      tiles.appendChild(h('button', { class: 'fa-tile', type: 'button', onclick: function () { openSection(k); } }, icon(info.icon), h('b', { text: info.label }), h('small', { text: cnt || info.desc })));
    });
    wrap.appendChild(tiles);
  }

  function renderSection(wrap, k) {
    var info = secInfo(k);
    wrap.appendChild(h('button', { class: 'fa-back', type: 'button', onclick: function () { openSection(null); } }, icon('left'), 'All sections'));
    wrap.appendChild(h('div', { class: 'fa-sec-head' }, icon(info.icon, 'fa-sec-ic'), h('div', null, h('h2', { text: info.label }), h('p', { text: info.desc }))));
    if (PREVIEW_IDS.indexOf(k) >= 0) {
      wrap.appendChild(h('div', { class: 'fa-sec-tools' }, h('button', { class: 'fa-btn fa-btn-soft', type: 'button', onclick: function () { postScroll(k); if (isPhoneLayout()) setView('preview'); } }, icon('eye'), 'Show in preview')));
    }
    var fields = h('div', { class: 'fa-fields' });
    var v = S.draft[k];
    if (k === 'meta') renderMeta(fields, v);
    else if (Array.isArray(v) || !isObj(v)) renderNode(fields, v, [k]);
    else renderChildren(fields, v, [k]);
    wrap.appendChild(fields);
  }
  function renderMeta(el, v) {
    var dl = h('dl', { class: 'fa-readonly' });
    Object.keys(v || {}).forEach(function (key) { dl.appendChild(h('dt', { text: friendlyKey(key) })); dl.appendChild(h('dd', { text: String(v[key]) })); });
    el.appendChild(dl);
    el.appendChild(h('p', { class: 'fa-hint', text: 'Read-only. The version number and date update automatically every time you download content.json.' }));
  }
  function renderSearch(wrap) {
    var q = S.search.toLowerCase();
    var terms = q.split(/\s+/).filter(Boolean);
    wrap.appendChild(h('p', { class: 'fa-hint', style: { margin: '0 0 12px' } }, 'Results for “', h('b', { text: S.search }), '”'));
    var all = h('div', { class: 'fa-fields' });
    sectionKeys().forEach(function (k) {
      if (k === 'meta') return;
      var info = secInfo(k);
      var blk = h('div', { class: 'fa-sblock fa-fields', 'data-title': (info.label + ' ' + k).toLowerCase() },
        h('button', { class: 'fa-back', type: 'button', style: { margin: '6px 0 0 -4px' }, onclick: function () { openSection(k); } }, icon(info.icon), h('b', { text: info.label })));
      var v = S.draft[k];
      if (Array.isArray(v) || !isObj(v)) renderNode(blk, v, [k]); else renderChildren(blk, v, [k]);
      all.appendChild(blk);
    });
    wrap.appendChild(all);
    function matches(s) { return terms.every(function (t) { return s.indexOf(t) >= 0; }); }
    var fields = all.querySelectorAll('.fa-field');
    Array.prototype.forEach.call(fields, function (f) { f.classList.toggle('fa-hidden', !matches(f.getAttribute('data-search') || '')); });
    // whole cards / sections whose title matches
    Array.prototype.forEach.call(all.querySelectorAll('.fa-card'), function (c) {
      var t = c.querySelector('.fa-card-title'); var s = t ? t.textContent.toLowerCase() : '';
      if (matches(s)) Array.prototype.forEach.call(c.querySelectorAll('.fa-field'), function (f) { f.classList.remove('fa-hidden'); });
    });
    Array.prototype.forEach.call(all.querySelectorAll('.fa-sblock'), function (b) {
      if (matches(b.getAttribute('data-title'))) Array.prototype.forEach.call(b.querySelectorAll('.fa-field'), function (f) { f.classList.remove('fa-hidden'); });
    });
    var shown = 0;
    Array.prototype.forEach.call(fields, function (f) {
      if (f.classList.contains('fa-hidden')) return;
      shown++;
      var c = f.parentElement;
      while (c && c !== all) { if (c.classList.contains('fa-card')) c.classList.add('open'); c = c.parentElement; }
    });
    Array.prototype.forEach.call(all.querySelectorAll('.fa-card,.fa-group,.fa-list,.fa-sblock,.fa-help'), function (el) {
      if (!el.querySelector('.fa-field:not(.fa-hidden)')) el.classList.add('fa-hidden');
    });
    if (!shown) wrap.appendChild(h('div', { class: 'fa-note', style: { textAlign: 'center', padding: '28px 16px' } }, h('b', { text: 'Nothing found.' }), h('br'), 'Try another word, or pick a section from the list.'));
  }

  function renderChildren(el, obj, path) {
    var sp = schemaPath(path);
    if (sp === 'enquiry.googleForm') el.appendChild(formHelp());
    if (sp === 'settings') el.appendChild(apiKeyHelp());
    if (sp === 'gallery') el.appendChild(h('div', { class: 'fa-help' }, h('h4', null, icon('image'), 'Photos from Google Drive'),
      h('p', { text: 'Upload photos/videos to Google Drive, share the folder as ‘Anyone with the link – Viewer’, paste the link here. Subfolders become albums automatically. New photos appear on the site within a few minutes — no need to download content.json again.' }),
      h('p', { style: { marginTop: '6px' } }, 'Needs a Google Drive API key in ', h('button', { type: 'button', style: { textDecoration: 'underline', fontWeight: '600', minHeight: '32px' }, onclick: function () { openSection('settings'); }, text: 'Settings' }), '.')));
    Object.keys(obj).forEach(function (k) {
      // hide answer choices for non-choice form questions
      if (k === 'options' && /googleForm\.fields\.\*$/.test(sp) && obj.type !== 'choice') return;
      renderNode(el, obj[k], path.concat(k), obj);
    });
  }
  function renderNode(el, v, path, parent) {
    if (Array.isArray(v)) {
      var key = last(path);
      if (key === 'images') return renderImageGrid(el, v, path, parent);
      var allStr = v.every(function (x) { return typeof x === 'string' || typeof x === 'number'; });
      var tpl = v.length ? v[0] : liveTemplate(path);
      if (v.length === 0 && tpl === undefined) allStr = true;
      if (allStr && (tpl === undefined || typeof tpl !== 'object')) {
        var useRows = ROW_KEYS[key] || v.some(function (x) { return String(x).length > 36; });
        return useRows ? renderRows(el, v, path) : renderChips(el, v, path);
      }
      return renderObjList(el, v, path);
    }
    if (isObj(v)) {
      var g = h('fieldset', { class: 'fa-group', 'data-path': ps(path) }, h('legend', { class: 'fa-sr', text: labelFor(path) }), h('div', { class: 'fa-group-t', 'aria-hidden': 'true' }, labelFor(path)));
      renderChildren(g, v, path);
      el.appendChild(g);
      return;
    }
    renderField(el, v, path, parent);
  }

  function fieldShell(path, extraSearch) {
    var id = nextId('f');
    var label = labelFor(path), hint = hintFor(path);
    var search = (label + ' ' + hint + ' ' + path.join(' ') + ' ' + (extraSearch || '')).toLowerCase();
    var wrap = h('div', { class: 'fa-field', 'data-path': ps(path), 'data-search': search });
    var lab = h('label', { class: 'fa-label', for: id, text: label });
    wrap.appendChild(lab);
    if (hint) wrap.appendChild(h('div', { class: 'fa-hint', id: id + '-h', text: hint }));
    return { wrap: wrap, id: id, lab: lab, hintId: hint ? id + '-h' : null };
  }
  function refreshCards(fromEl) {
    var c = fromEl.closest('.fa-card');
    while (c) { if (c._refresh) c._refresh(); c = c.parentElement && c.parentElement.closest('.fa-card'); }
  }

  function kindOf(path, v) {
    var key = last(path), sp = schemaPath(path);
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'number') return 'number';
    if (IMAGE_KEYS[key]) return 'image';
    if (path[0] === 'brand' && path[1] === 'colors') return 'color';
    if (key === 'category' && path[0] === 'gallery' && (path[1] === 'albums' || path[1] === 'driveSources')) return 'category';
    if (key === 'googleApiKey') return 'secret';
    if (key === 'driveFolder' || (key === 'folder' && path[1] === 'driveSources')) return 'drive';
    if (key === 'type' && /googleForm\.fields\.\*\.type$/.test(sp)) return 'formtype';
    if (key === 'target') return 'target';
    if (key === 'icon') return 'icon';
    if (URL_KEYS[key]) return 'url';
    if (key === 'email') return 'email';
    if (key === 'whatsapp' || (key === 'number' && path[0] !== 'stats')) return 'tel';
    if (key === 'entry') return 'entry';
    if (LONG_KEYS[key] || (typeof v === 'string' && v.length > 90)) return 'textarea';
    return 'text';
  }

  function renderField(el, v, path, parent) {
    var kind = kindOf(path, v);
    var f = fieldShell(path, typeof v === 'string' && !isDataUrl(v) && v.length < 400 ? v : '');
    var wrap = f.wrap;
    var input;
    function onVal(val) { setAt(path, val); changed(); refreshCards(wrap); }
    switch (kind) {
      case 'bool': {
        wrap.innerHTML = '';
        input = h('input', { type: 'checkbox', id: f.id, checked: v, role: 'switch' });
        input.addEventListener('change', function () { onVal(input.checked); });
        wrap.appendChild(h('label', { class: 'fa-switch', for: f.id },
          h('span', null, h('span', { class: 'fa-label', text: labelFor(path) }), hintFor(path) ? h('span', { class: 'fa-hint', style: { display: 'block', marginTop: '2px' }, text: hintFor(path) }) : null),
          input, h('span', { class: 'fa-switch-ui', 'aria-hidden': 'true' })));
        break;
      }
      case 'number': {
        input = h('input', { class: 'fa-input', type: 'number', id: f.id, value: String(v), inputmode: 'decimal', step: 'any' });
        input.addEventListener('input', function () { var n = input.value === '' ? 0 : Number(input.value); if (!isNaN(n)) onVal(n); });
        wrap.appendChild(input);
        break;
      }
      case 'image': return renderImageField(el, v, path, f);
      case 'secret': {
        input = h('input', { class: 'fa-input', type: 'password', id: f.id, value: v == null ? '' : String(v), autocomplete: 'off', spellcheck: 'false', placeholder: 'AIza…' });
        var eye = h('button', { class: 'fa-btn fa-btn-soft', type: 'button', 'aria-label': 'Show key' }, icon('eye'), 'Show');
        eye.addEventListener('click', function () {
          var show = input.type === 'password'; input.type = show ? 'text' : 'password';
          eye.innerHTML = ''; append(eye, [icon(show ? 'eyeoff' : 'eye'), show ? 'Hide' : 'Show']); eye.setAttribute('aria-label', show ? 'Hide key' : 'Show key');
        });
        input.addEventListener('input', function () { onVal(input.value.trim()); });
        wrap.appendChild(h('div', { class: 'fa-row' }, input, eye));
        break;
      }
      case 'drive': {
        input = h('input', { class: 'fa-input', type: 'url', id: f.id, value: v, inputmode: 'url', spellcheck: 'false', autocomplete: 'off', placeholder: 'https://drive.google.com/drive/folders/…' });
        var res = h('div', { class: 'fa-drive-res', role: 'status', 'aria-live': 'polite' });
        var chk = h('button', { class: 'fa-btn fa-btn-soft', type: 'button' }, icon('check'), 'Check folder');
        input.addEventListener('input', function () { onVal(input.value.trim()); res.textContent = ''; res.className = 'fa-drive-res'; });
        chk.addEventListener('click', function () {
          chk.disabled = true; res.className = 'fa-drive-res'; res.textContent = 'Checking…';
          checkDriveFolder(input.value.trim()).then(function (msg) { res.className = 'fa-drive-res ok'; res.textContent = msg; },
            function (e) { res.className = 'fa-drive-res err'; res.textContent = e.message; })
            .then(function () { chk.disabled = false; });
        });
        wrap.appendChild(h('div', { class: 'fa-row' }, input, chk));
        wrap.appendChild(res);
        break;
      }
      case 'color': {
        var hex = /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000';
        var picker = h('input', { type: 'color', value: hex, 'aria-label': labelFor(path) + ' colour picker' });
        input = h('input', { class: 'fa-input', type: 'text', id: f.id, value: v, maxlength: '7', spellcheck: 'false' });
        picker.addEventListener('input', function () { input.value = picker.value.toUpperCase(); onVal(input.value); });
        input.addEventListener('input', function () {
          var t = input.value.trim(); if (t && t[0] !== '#') t = '#' + t;
          if (/^#[0-9a-f]{6}$/i.test(t)) { picker.value = t; onVal(t.toUpperCase()); input.style.borderColor = ''; } else input.style.borderColor = 'var(--red)';
        });
        wrap.appendChild(h('div', { class: 'fa-color' }, picker, input));
        break;
      }
      case 'category': {
        input = h('select', { class: 'fa-select', id: f.id });
        var cats = (S.draft.gallery && Array.isArray(S.draft.gallery.categories)) ? S.draft.gallery.categories.slice() : [];
        if (v && cats.indexOf(v) < 0) cats.push(v);
        if (!v) input.appendChild(h('option', { value: '', text: '— Choose a category —' }));
        cats.forEach(function (c) { input.appendChild(h('option', { value: c, text: c })); });
        input.appendChild(h('option', { value: '__new__', text: '＋ New category…' }));
        input.value = v || '';
        input.addEventListener('change', function () {
          if (input.value !== '__new__') { onVal(input.value); return; }
          input.value = getAt(path) || '';
          promptModal('New gallery category', 'Category name', 'e.g. Corporate training').then(function (name) {
            if (!name) return;
            var g = S.draft.gallery; if (!Array.isArray(g.categories)) g.categories = [];
            if (g.categories.indexOf(name) < 0) g.categories.push(name);
            setAt(path, name); changed();
            rerender('[data-path="' + ps(path) + '"] select');
            toast('Category “' + name + '” created');
          });
        });
        wrap.appendChild(input);
        break;
      }
      case 'formtype': {
        input = h('select', { class: 'fa-select', id: f.id });
        var known = FORM_TYPES.map(function (t) { return t[0]; });
        FORM_TYPES.forEach(function (t) { input.appendChild(h('option', { value: t[0], text: t[1] })); });
        if (v && known.indexOf(v) < 0) input.appendChild(h('option', { value: v, text: v }));
        input.value = v || 'text';
        input.addEventListener('change', function () {
          onVal(input.value);
          var p = getAt(path.slice(0, -1));
          if (input.value === 'choice' && p && !Array.isArray(p.options)) p.options = [];
          rerender('[data-path="' + ps(path) + '"] select');
        });
        wrap.appendChild(input);
        break;
      }
      case 'target': {
        input = h('select', { class: 'fa-select', id: f.id });
        var ids = TARGET_IDS.slice(); if (v && ids.indexOf(v) < 0) ids.push(v);
        ids.forEach(function (t) { input.appendChild(h('option', { value: t, text: (SECTIONS[t] ? SECTIONS[t].label : friendlyKey(t)) + ' (' + t + ')' })); });
        input.value = v;
        input.addEventListener('change', function () { onVal(input.value); });
        wrap.appendChild(input);
        break;
      }
      case 'icon': {
        input = h('select', { class: 'fa-select', id: f.id });
        var icons = KNOWN_ICONS.slice();
        collectIcons(S.live, icons); collectIcons(S.draft, icons);
        if (v && icons.indexOf(v) < 0) icons.push(v);
        if (!v) input.appendChild(h('option', { value: '', text: '— none —' }));
        icons.forEach(function (t) { input.appendChild(h('option', { value: t, text: friendlyKey(t) })); });
        input.value = v || '';
        input.addEventListener('change', function () { onVal(input.value); });
        wrap.appendChild(input);
        break;
      }
      case 'url': {
        input = h('input', { class: 'fa-input', type: 'url', id: f.id, value: v, inputmode: 'url', spellcheck: 'false', placeholder: 'https://…', autocomplete: 'off' });
        var test = h('a', { class: 'fa-test', target: '_blank', rel: 'noopener', title: 'Open this link in a new tab' }, 'Test', icon('external'));
        var upd = function () { var u = input.value.trim(); if (u) { test.href = u; test.removeAttribute('aria-disabled'); } else { test.removeAttribute('href'); test.setAttribute('aria-disabled', 'true'); } };
        upd();
        input.addEventListener('input', function () { onVal(input.value.trim()); upd(); });
        wrap.appendChild(h('div', { class: 'fa-row' }, input, test));
        break;
      }
      case 'textarea': {
        input = h('textarea', { class: 'fa-textarea', id: f.id, rows: '2' });
        input.value = v == null ? '' : String(v);
        var grow = function () { input.style.height = 'auto'; input.style.height = Math.max(84, input.scrollHeight + 2) + 'px'; };
        input.addEventListener('input', function () { onVal(input.value); grow(); });
        wrap.appendChild(input);
        requestAnimationFrame(grow); setTimeout(grow, 60);
        break;
      }
      case 'entry': {
        input = h('input', { class: 'fa-input', type: 'text', id: f.id, value: v, inputmode: 'numeric', spellcheck: 'false', placeholder: 'e.g. 103526039' });
        input.addEventListener('input', function () {
          var t = input.value.trim().replace(/^entry\./i, '');
          if (t !== input.value.trim()) input.value = t;
          onVal(t);
        });
        wrap.appendChild(input);
        break;
      }
      default: {
        var type = kind === 'email' ? 'email' : kind === 'tel' ? 'tel' : 'text';
        input = h('input', { class: 'fa-input', type: type, id: f.id, value: v == null ? '' : String(v), autocomplete: 'off' });
        if (kind === 'tel') input.setAttribute('inputmode', 'tel');
        input.addEventListener('input', function () { onVal(input.value); });
        wrap.appendChild(input);
      }
    }
    if (input && f.hintId && kind !== 'bool') input.setAttribute('aria-describedby', f.hintId);
    el.appendChild(wrap);
  }
  function collectIcons(o, out) {
    if (Array.isArray(o)) o.forEach(function (x) { collectIcons(x, out); });
    else if (isObj(o)) Object.keys(o).forEach(function (k) { if (k === 'icon' && typeof o[k] === 'string' && o[k] && out.indexOf(o[k]) < 0) out.push(o[k]); else collectIcons(o[k], out); });
  }

  /* ---------- image field ---------- */
  function maxEdgeFor(path) { return SMALL_IMAGE_KEYS[last(path)] ? 800 : 1600; }
  function renderImageField(el, v, path, f) {
    var wrap = f.wrap;
    var key = last(path);
    var prev = h('div', { class: 'fa-img-prev' + (key === 'logo' ? ' contain' : '') });
    var meta = h('div', { class: 'fa-img-meta' });
    var urlIn = h('input', { class: 'fa-input', type: 'url', id: f.id, spellcheck: 'false', autocomplete: 'off', inputmode: 'url' });
    var file = h('input', { type: 'file', accept: 'image/*', class: 'fa-sr', tabindex: '-1', 'aria-hidden': 'true' });
    var upBtn = h('button', { class: 'fa-btn fa-btn-soft', type: 'button', onclick: function () { file.click(); } }, icon('upload'), 'Upload');
    var rmBtn = h('button', { class: 'fa-btn fa-btn-danger-ghost', type: 'button', onclick: function () {
      var old = getAt(path); if (!old) return;
      setAt(path, ''); changed(); paint(); refreshCards(wrap);
      toast('Image removed', { action: { label: 'Undo', fn: function () { setAt(path, old); changed(); paint(); refreshCards(wrap); } } });
    } }, icon('trash'), 'Remove');
    function paint() {
      var val = getAt(path) || '';
      prev.innerHTML = '';
      meta.innerHTML = '';
      if (val) {
        var img = h('img', { src: val, alt: '', loading: 'lazy' });
        img.addEventListener('error', function () { prev.innerHTML = ''; prev.appendChild(icon('alert')); meta.appendChild(h('span', { class: 'fa-pill warn', text: 'Image not found' })); });
        prev.appendChild(img);
      } else prev.appendChild(icon('image'));
      if (isDataUrl(val)) {
        urlIn.value = ''; urlIn.placeholder = 'Uploaded photo · or paste a link to replace';
        meta.appendChild(h('span', { class: 'fa-pill ok', text: 'Uploaded' }));
        meta.appendChild(h('span', { text: fmtBytes(dataUrlBytes(val)) }));
      } else {
        urlIn.value = val; urlIn.placeholder = '…or paste an image link (https://…)';
        if (val) meta.appendChild(h('span', { class: 'fa-pill', text: 'Web link' }));
        else meta.appendChild(h('span', { text: 'No image yet. ' + (maxEdgeFor(path) === 800 ? 'Resized to 800 px.' : 'Big photos are resized automatically.') }));
      }
      rmBtn.disabled = !val;
    }
    urlIn.addEventListener('input', function () {
      var t = urlIn.value.trim();
      if (!t && isDataUrl(getAt(path))) return;
      setAt(path, t); changed(); refreshCards(wrap);
      debounce('imgpaint', function () { var cur = getAt(path); if (!isDataUrl(cur)) { prev.innerHTML = ''; if (cur) prev.appendChild(h('img', { src: cur, alt: '' })); else prev.appendChild(icon('image')); } }, 500);
    });
    function handleFiles(files) {
      var fl = files && files[0]; if (!fl) return;
      if (!/^image\//.test(fl.type) && !/\.(jpe?g|png|webp|gif|bmp|heic|avif)$/i.test(fl.name)) { toast('That file is not a photo. Choose a JPG, PNG or WebP.', { kind: 'err' }); return; }
      upBtn.disabled = true; upBtn.lastChild.textContent = 'Compressing…';
      compressImage(fl, maxEdgeFor(path)).then(function (r) {
        setAt(path, r.url); changed(); paint(); refreshCards(wrap);
        toast('Photo added · ' + fmtBytes(r.bytes) + ' (was ' + fmtBytes(fl.size) + ')');
      }).catch(function (e) { toast('Couldn’t read this photo (' + (e && e.message || 'unsupported format') + '). Try a JPG or PNG.', { kind: 'err', timeout: 7000 }); })
        .then(function () { upBtn.disabled = false; upBtn.lastChild.textContent = 'Upload'; file.value = ''; });
    }
    file.addEventListener('change', function () { handleFiles(file.files); });
    var box = h('div', { class: 'fa-img' }, prev, h('div', { class: 'fa-img-side' }, h('div', { class: 'fa-img-btns' }, upBtn, rmBtn), urlIn, meta), file);
    box.addEventListener('dragover', function (e) { if (hasFiles(e)) { e.preventDefault(); e.stopPropagation(); box.classList.add('drag'); } });
    box.addEventListener('dragleave', function () { box.classList.remove('drag'); });
    box.addEventListener('drop', function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); box.classList.remove('drag'); handleFiles(e.dataTransfer.files); });
    wrap.appendChild(box);
    if (f.hintId) urlIn.setAttribute('aria-describedby', f.hintId);
    paint();
    el.appendChild(wrap);
  }
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }

  /* ---------- image compression ---------- */
  var webpOK = null;
  function supportsWebp() {
    if (webpOK === null) { try { var c = document.createElement('canvas'); c.width = c.height = 1; webpOK = c.toDataURL('image/webp', 0.8).indexOf('data:image/webp') === 0; } catch (e) { webpOK = false; } }
    return webpOK;
  }
  function decodeImage(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file).catch(function () { return decodeViaImg(file); });
    }
    return decodeViaImg(file);
  }
  function decodeViaImg(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { res(img); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('unsupported image format')); };
      img.src = url;
    });
  }
  function compressImage(file, maxEdge) {
    return decodeImage(file).then(function (src) {
      var w = src.naturalWidth || src.width, hgt = src.naturalHeight || src.height;
      if (!w || !hgt) throw new Error('empty image');
      var scale = Math.min(1, maxEdge / Math.max(w, hgt));
      var tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(hgt * scale));
      // step down by halves for smoother results
      var cur = src, cw = w, ch = hgt;
      while (cw / 2 > tw * 1.05 && ch / 2 > th * 1.05) {
        var nw = Math.round(cw / 2), nh = Math.round(ch / 2);
        var c1 = document.createElement('canvas'); c1.width = nw; c1.height = nh;
        var x1 = c1.getContext('2d'); x1.imageSmoothingEnabled = true; x1.imageSmoothingQuality = 'high'; x1.drawImage(cur, 0, 0, nw, nh);
        cur = c1; cw = nw; ch = nh;
      }
      var c = document.createElement('canvas'); c.width = tw; c.height = th;
      var ctx = c.getContext('2d');
      var webp = supportsWebp();
      if (!webp) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th); }
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(cur, 0, 0, tw, th);
      if (src.close) try { src.close(); } catch (e) { }
      var url = webp ? c.toDataURL('image/webp', 0.8) : '';
      if (url.indexOf('data:image/webp') !== 0) url = c.toDataURL('image/jpeg', 0.82);
      return { url: url, w: tw, h: th, bytes: dataUrlBytes(url) };
    });
  }

  /* ---------- image grid (albums) ---------- */
  function renderImageGrid(el, arr, path, parent) {
    var f = fieldShell(path, arr.filter(function (x) { return !isDataUrl(x); }).join(' '));
    var wrap = f.wrap;
    var cnt = h('span', { class: 'fa-count', text: String(arr.length) });
    f.lab.appendChild(cnt);
    var hasCover = parent && isObj(parent) && 'thumb' in parent;
    var file = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'fa-sr', tabindex: '-1', 'aria-hidden': 'true', id: f.id });
    var drop = h('button', { class: 'fa-drop', type: 'button', onclick: function () { file.click(); } },
      icon('upload'), h('b', { text: 'Drop training photos here' }), h('small', { text: 'or tap to choose. You can pick many at once; they are resized automatically.' }));
    var prog = h('div', { class: 'fa-progress fa-hidden', role: 'status' });
    var grid = h('div', { class: 'fa-grid' });
    var urlIn = h('input', { class: 'fa-input', type: 'url', placeholder: 'Add a photo by web link (https://…)', 'aria-label': 'Add a photo by web link', inputmode: 'url' });
    var urlAdd = h('button', { class: 'fa-btn fa-btn-soft', type: 'button', onclick: addUrl }, icon('plus'), 'Add');
    urlIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } });
    function addUrl() {
      var u = urlIn.value.trim(); if (!u) return;
      arr.push(u); if (hasCover && !parent.thumb) parent.thumb = u;
      urlIn.value = ''; changed(); drawGrid(); refreshCards(wrap); toast('Photo link added');
    }
    function moveImg(i, to) {
      if (to < 0 || to >= arr.length) return;
      var it = arr.splice(i, 1)[0]; arr.splice(to, 0, it); changed(); drawGrid();
      var t = grid.children[to]; if (t) { t.classList.add('fa-flash'); }
    }
    function delImg(i) {
      var removed = arr.splice(i, 1)[0]; changed(); drawGrid(); refreshCards(wrap);
      toast('Photo deleted', { action: { label: 'Undo', fn: function () { arr.splice(Math.min(i, arr.length), 0, removed); changed(); drawGrid(); refreshCards(wrap); toast('Photo restored'); } } });
    }
    function setCover(i) {
      parent.thumb = arr[i]; changed(); drawGrid();
      // update the cover field in the same card
      var cardBody = wrap.parentElement;
      var coverField = cardBody && cardBody.querySelector(':scope > [data-path="' + ps(path.slice(0, -1).concat('thumb')) + '"]');
      if (coverField) { var nf = h('div'); renderNode(nf, parent.thumb, path.slice(0, -1).concat('thumb'), parent); coverField.replaceWith(nf.firstChild); }
      refreshCards(wrap);
      toast('Cover photo set');
    }
    function openSheet(i) {
      var src = arr[i];
      modal({
        title: 'Photo ' + (i + 1) + ' of ' + arr.length, icon: 'image',
        body: [h('img', { class: 'fa-sheet-img', src: src, alt: '' }),
          h('div', { class: 'fa-img-meta' }, isDataUrl(src) ? h('span', { class: 'fa-pill ok', text: 'Uploaded · ' + fmtBytes(dataUrlBytes(src)) }) : h('span', { class: 'fa-pill', text: 'Web link' }), hasCover && parent.thumb === src ? h('span', { class: 'fa-pill warn', text: 'Cover photo' }) : null),
          h('div', { class: 'fa-sheet-actions' },
            h('button', { class: 'fa-btn fa-btn-ghost', type: 'button', disabled: i === 0, 'data-v': 'prev' }, icon('left'), 'Move earlier'),
            h('button', { class: 'fa-btn fa-btn-ghost', type: 'button', disabled: i === arr.length - 1, 'data-v': 'next' }, icon('right'), 'Move later'),
            hasCover ? h('button', { class: 'fa-btn fa-btn-soft', type: 'button', 'data-v': 'cover' }, icon('star'), 'Set as cover') : null,
            h('button', { class: 'fa-btn fa-btn-danger-ghost', type: 'button', 'data-v': 'del' }, icon('trash'), 'Delete photo'))],
        onOpen: function (close, box) { Array.prototype.forEach.call(box.querySelectorAll('[data-v]'), function (b) { b.addEventListener('click', function () { close(b.getAttribute('data-v')); }); }); }
      }).then(function (v) {
        if (v === 'prev') moveImg(i, i - 1);
        else if (v === 'next') moveImg(i, i + 1);
        else if (v === 'cover') setCover(i);
        else if (v === 'del') delImg(i);
      });
    }
    function drawGrid() {
      grid.innerHTML = '';
      cnt.textContent = String(arr.length);
      arr.forEach(function (src, i) {
        var isCover = hasCover && parent.thumb === src;
        var img = h('img', { src: src, alt: 'Photo ' + (i + 1), loading: 'lazy', draggable: 'false' });
        var tile = h('div', { class: 'fa-tilei', 'data-path': ps(path.concat(i)), draggable: canHover() ? 'true' : null },
          h('button', { class: 'fa-tile-open', type: 'button', 'aria-label': 'Photo ' + (i + 1) + (isCover ? ' (cover)' : '') + ': options', onclick: function () { openSheet(i); } }, img),
          isCover ? h('span', { class: 'fa-tile-badge', text: 'Cover' }) : null,
          h('span', { class: 'fa-tile-num', text: String(i + 1) }),
          h('div', { class: 'fa-tile-acts' },
            h('button', { class: 'fa-ibtn', type: 'button', 'aria-label': 'Move photo ' + (i + 1) + ' earlier', title: 'Move earlier', disabled: i === 0, onclick: function () { moveImg(i, i - 1); } }, icon('left')),
            h('button', { class: 'fa-ibtn', type: 'button', 'aria-label': 'Move photo ' + (i + 1) + ' later', title: 'Move later', disabled: i === arr.length - 1, onclick: function () { moveImg(i, i + 1); } }, icon('right')),
            hasCover ? h('button', { class: 'fa-ibtn', type: 'button', 'aria-label': 'Set photo ' + (i + 1) + ' as cover', title: 'Set as cover', onclick: function () { setCover(i); } }, icon('star')) : null,
            h('button', { class: 'fa-ibtn', type: 'button', 'aria-label': 'Delete photo ' + (i + 1), title: 'Delete', onclick: function () { delImg(i); } }, icon('trash'))));
        // drag reorder (mouse)
        tile.addEventListener('dragstart', function (e) { e.stopPropagation(); S.drag = { arr: arr, from: i }; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'img'); } catch (x) { } tile.classList.add('dragging'); });
        tile.addEventListener('dragend', function () { S.drag = null; tile.classList.remove('dragging'); clearDrop(grid); });
        tile.addEventListener('dragover', function (e) {
          if (!S.drag || S.drag.arr !== arr) return; e.preventDefault(); e.stopPropagation();
          var r = tile.getBoundingClientRect(); var after = e.clientX > r.left + r.width / 2;
          clearDrop(grid); tile.classList.add(after ? 'drop-after' : 'drop-before');
        });
        tile.addEventListener('drop', function (e) {
          if (!S.drag || S.drag.arr !== arr) return; e.preventDefault(); e.stopPropagation();
          var r = tile.getBoundingClientRect(); var after = e.clientX > r.left + r.width / 2;
          var from = S.drag.from, to = i + (after ? 1 : 0); if (from < to) to--;
          S.drag = null; if (from !== to) moveImg(from, to); else clearDrop(grid);
        });
        grid.appendChild(tile);
      });
    }
    function processFiles(list) {
      var files = Array.prototype.filter.call(list || [], function (fl) { return /^image\//.test(fl.type) || /\.(jpe?g|png|webp|gif|bmp|heic|avif)$/i.test(fl.name); });
      if (!files.length) { toast('No photos found in what you dropped.', { kind: 'warn' }); return; }
      var i = 0, ok = 0, bytes = 0, failed = 0;
      prog.classList.remove('fa-hidden');
      drop.disabled = true;
      var label = h('div'); var bar = h('div', { class: 'fa-bar' }, h('i'));
      prog.innerHTML = ''; prog.appendChild(label); prog.appendChild(bar);
      function step() {
        if (i >= files.length) {
          prog.classList.add('fa-hidden'); drop.disabled = false; file.value = '';
          refreshCards(wrap);
          toast('Added ' + ok + ' photo' + (ok === 1 ? '' : 's') + ' (' + fmtBytes(bytes) + ')' + (failed ? ' · ' + failed + ' could not be read' : ''), { kind: failed ? 'warn' : 'ok' });
          return;
        }
        var fl = files[i];
        label.textContent = 'Compressing photo ' + (i + 1) + ' of ' + files.length + ' · ' + trunc(fl.name, 32);
        bar.firstChild.style.width = Math.round(i / files.length * 100) + '%';
        compressImage(fl, 1600).then(function (r) {
          arr.push(r.url); ok++; bytes += r.bytes;
          if (hasCover && !parent.thumb) { parent.thumb = r.url; }
          changed(); drawGrid();
        }).catch(function () { failed++; }).then(function () {
          i++; bar.firstChild.style.width = Math.round(i / files.length * 100) + '%';
          setTimeout(step, 0);
        });
      }
      step();
    }
    file.addEventListener('change', function () { processFiles(file.files); });
    drop.addEventListener('dragover', function (e) { if (hasFiles(e)) { e.preventDefault(); e.stopPropagation(); drop.classList.add('drag'); } });
    drop.addEventListener('dragleave', function () { drop.classList.remove('drag'); });
    drop.addEventListener('drop', function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); drop.classList.remove('drag'); processFiles(e.dataTransfer.files); });
    wrap.appendChild(drop); wrap.appendChild(file); wrap.appendChild(prog); wrap.appendChild(grid);
    wrap.appendChild(h('div', { class: 'fa-row' }, urlIn, urlAdd));
    if (hasCover) wrap.appendChild(h('div', { class: 'fa-hint', text: canHover() ? 'Hover a photo to move it, delete it or make it the cover. You can also drag photos to reorder.' : 'Tap a photo to move it, delete it or make it the cover.' }));
    drawGrid();
    el.appendChild(wrap);
  }
  function clearDrop(container) {
    Array.prototype.forEach.call(container.querySelectorAll('.drop-before,.drop-after'), function (x) { x.classList.remove('drop-before', 'drop-after'); });
  }

  /* ---------- chips ---------- */
  function renderChips(el, arr, path) {
    var f = fieldShell(path, arr.join(' '));
    var wrap = f.wrap;
    f.lab.appendChild(h('span', { class: 'fa-count', text: String(arr.length) }));
    var box = h('div', { class: 'fa-chips' });
    var sing = singularFor(path);
    arr.forEach(function (val, i) {
      var t = h('button', { class: 'fa-chip-t', type: 'button', title: 'Click to edit', text: String(val) });
      var chip = h('span', { class: 'fa-chip' }, t,
        h('button', { class: 'fa-ibtn', type: 'button', 'aria-label': 'Remove ' + val, onclick: function () {
          var removed = arr.splice(i, 1)[0]; changed();
          var inUse = path.join('.') === 'gallery.categories' && (S.draft.gallery.albums || []).some(function (a) { return a.category === removed; });
          rerender('[data-path="' + ps(path) + '"] .fa-chip-add input');
          toast('Removed “' + removed + '”' + (inUse ? ' (some albums still use it)' : ''), { kind: inUse ? 'warn' : 'ok', action: { label: 'Undo', fn: function () { arr.splice(Math.min(i, arr.length), 0, removed); changed(); rerender(); } } });
        } }, icon('x')));
      t.addEventListener('click', function () {
        var inp = h('input', { class: 'fa-chip-edit', type: 'text', value: String(val), 'aria-label': 'Edit ' + sing });
        var committed = false;
        function commit() {
          if (committed) return; committed = true;
          var nv = inp.value.trim();
          if (nv && nv !== val) {
            if (path.join('.') === 'gallery.categories') (S.draft.gallery.albums || []).forEach(function (a) { if (a.category === val) a.category = nv; });
            arr[i] = nv; changed();
          }
          rerender();
        }
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { committed = true; rerender(); } });
        inp.addEventListener('blur', commit);
        chip.replaceWith(inp); inp.focus(); inp.select();
      });
      box.appendChild(chip);
    });
    var addIn = h('input', { type: 'text', id: f.id, placeholder: 'Add ' + sing + '…', autocomplete: 'off' });
    function addIt() {
      var parts = addIn.value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!parts.length) { addIn.focus(); return; }
      parts.forEach(function (p) { arr.push(p); });
      changed(); rerender('[data-path="' + ps(path) + '"] .fa-chip-add input');
      toast('Added “' + trunc(parts.join(', '), 40) + '”');
    }
    addIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addIt(); } });
    box.appendChild(h('div', { class: 'fa-chip-add' }, addIn, h('button', { class: 'fa-btn fa-btn-soft', type: 'button', onclick: addIt }, icon('plus'), 'Add')));
    wrap.appendChild(box);
    el.appendChild(wrap);
  }

  /* ---------- rows (ordered text list) ---------- */
  function renderRows(el, arr, path) {
    var f = fieldShell(path, arr.join(' '));
    var wrap = f.wrap;
    f.lab.appendChild(h('span', { class: 'fa-count', text: String(arr.length) }));
    var rows = h('div', { class: 'fa-rows' });
    var sing = singularFor(path);
    arr.forEach(function (val, i) {
      var ta = h('textarea', { class: 'fa-textarea', rows: '1', 'aria-label': friendlyKey(sing) + ' ' + (i + 1), id: i === 0 ? f.id : null });
      ta.value = String(val);
      var grow = function () { ta.style.height = 'auto'; ta.style.height = Math.max(44, ta.scrollHeight + 2) + 'px'; };
      ta.addEventListener('input', function () { arr[i] = ta.value; changed(); grow(); });
      ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); arr.splice(i + 1, 0, ''); changed(); rerender('[data-path="' + ps(path.concat(i + 1)) + '"] textarea'); } });
      requestAnimationFrame(grow); setTimeout(grow, 60);
      var mv = function (to) { return function () { if (to < 0 || to >= arr.length) return; var it = arr.splice(i, 1)[0]; arr.splice(to, 0, it); changed(); rerender('[data-path="' + ps(path.concat(to)) + '"] [data-act="' + (to < i ? 'up' : 'down') + '"]'); }; };
      rows.appendChild(h('div', { class: 'fa-rowi', 'data-path': ps(path.concat(i)) },
        h('span', { class: 'fa-num', text: String(i + 1) }), ta,
        h('button', { class: 'fa-ibtn', type: 'button', 'data-act': 'up', 'aria-label': 'Move ' + sing + ' ' + (i + 1) + ' up', disabled: i === 0, onclick: mv(i - 1) }, icon('up')),
        h('button', { class: 'fa-ibtn', type: 'button', 'data-act': 'down', 'aria-label': 'Move ' + sing + ' ' + (i + 1) + ' down', disabled: i === arr.length - 1, onclick: mv(i + 1) }, icon('down')),
        h('button', { class: 'fa-ibtn danger', type: 'button', 'aria-label': 'Delete ' + sing + ' ' + (i + 1), onclick: function () {
          var removed = arr.splice(i, 1)[0]; changed(); rerender();
          toast('Deleted ' + sing, { action: { label: 'Undo', fn: function () { arr.splice(Math.min(i, arr.length), 0, removed); changed(); rerender(); } } });
        } }, icon('trash'))));
    });
    wrap.appendChild(rows);
    wrap.appendChild(h('button', { class: 'fa-add', type: 'button', onclick: function () { arr.push(''); changed(); rerender('[data-path="' + ps(path.concat(arr.length - 1)) + '"] textarea'); } }, icon('plus'), 'Add ' + sing));
    el.appendChild(wrap);
  }

  /* ---------- object lists (cards) ---------- */
  function liveTemplate(path) {
    var l = getIn(S.live, path);
    if (Array.isArray(l) && l.length) return l[0];
    var sp = schemaPath(path);
    // try any matching list in live (e.g. images of another album)
    if (FALLBACK_TPL[sp]) return FALLBACK_TPL[sp];
    return undefined;
  }
  function emptyLike(v, key) {
    if (Array.isArray(v)) return [];
    if (isObj(v)) { var o = {}; Object.keys(v).forEach(function (k) { o[k] = (k === 'icon' || k === 'target') ? v[k] : k === 'type' && typeof v[k] === 'string' && FORM_TYPES.some(function (t) { return t[0] === v[k]; }) ? 'text' : emptyLike(v[k], k); }); return o; }
    if (typeof v === 'number') return 0;
    if (typeof v === 'boolean') return false;
    return '';
  }
  function uniqueId(arr, base) {
    var ids = arr.map(function (x) { return x && x.id; });
    var n = 1, id;
    do { id = base + '-' + Math.random().toString(36).slice(2, 6); n++; } while (ids.indexOf(id) >= 0 && n < 50);
    return id;
  }
  function newItemFor(arr, path) {
    var sp = schemaPath(path);
    var tpl = arr.length ? arr[0] : liveTemplate(path);
    if (tpl === undefined) return '';
    var it = emptyLike(tpl);
    if (isObj(it)) {
      if ('id' in it) it.id = uniqueId(arr, sp === 'gallery.albums' ? 'album' : (singularFor(path).replace(/\s+/g, '-') || 'item'));
      if (sp === 'gallery.albums' || sp === 'gallery.driveSources') { it.category = (S.draft.gallery && S.draft.gallery.categories || [])[0] || ''; }
    }
    return it;
  }
  function cardTitle(it, i) {
    if (!isObj(it)) return 'Item ' + (i + 1);
    var t = it.title || it.name || it.label || '';
    if (it.year) t = it.year + (t ? ' — ' + t : '');
    if (!t && it.number) t = it.number;
    if (!t && it.value != null) t = String(it.value);
    if (!t && 'folder' in it) t = (it.category || 'Google Drive') + ' · Drive folder';
    return t ? String(t) : 'Untitled ' + (i + 1);
  }
  function cardSub(it) {
    if (!isObj(it)) return '';
    if (Array.isArray(it.images)) return [it.category, it.images.length + ' photo' + (it.images.length === 1 ? '' : 's')].filter(Boolean).join(' · ');
    if (it.entry != null && it.type) { var ft = FORM_TYPES.filter(function (t) { return t[0] === it.type; })[0]; return (ft ? ft[1] : it.type) + (it.required ? ' · required' : ''); }
    if (it.value != null && it.label) return it.value + (it.suffix || '');
    var s = it.role || it.emphasis || it.type || it.audience || it.number || it.target || it.url || (Array.isArray(it.items) ? it.items.length + ' items' : '') || (Array.isArray(it.steps) ? it.steps.length + ' steps' : '') || it.text || '';
    return trunc(s, 80);
  }
  function cardImg(it) {
    if (!isObj(it)) return '';
    var keys = ['thumb', 'image', 'photo', 'logo', 'poster'];
    for (var i = 0; i < keys.length; i++) if (typeof it[keys[i]] === 'string' && it[keys[i]]) return { src: it[keys[i]], contain: keys[i] === 'logo' };
    if (Array.isArray(it.images) && it.images[0]) return { src: it.images[0] };
    return '';
  }

  function renderObjList(el, arr, path) {
    var sp = schemaPath(path);
    var sing = singularFor(path);
    var wrap = h('div', { class: 'fa-list', 'data-path': ps(path) });
    var head = h('div', { class: 'fa-list-head' }, h('span', { class: 'fa-label' }, labelFor(path), h('span', { class: 'fa-count', text: String(arr.length) })));
    wrap.appendChild(head);
    if (hintFor(path)) wrap.appendChild(h('div', { class: 'fa-hint', text: hintFor(path) }));
    var big = sp === 'gallery.albums';
    function addItem(atTop) {
      var it = newItemFor(arr, path);
      if (atTop) arr.unshift(it); else arr.push(it);
      if (isObj(it)) S.expanded.add(it);
      S.justAdded = it; changed(); rerender();
      toast('New ' + sing + ' added');
    }
    if (big) wrap.appendChild(h('button', { class: 'fa-add fa-add-big', type: 'button', onclick: function () { addItem(true); } }, icon('plus'), 'Add album'));
    var cards = h('div', { class: 'fa-cards' });
    arr.forEach(function (it, i) { cards.appendChild(renderCard(arr, i, path, sing)); });
    wrap.appendChild(cards);
    if (!arr.length) wrap.appendChild(h('div', { class: 'fa-note', text: 'No ' + labelFor(path).toLowerCase() + ' yet.' }));
    wrap.appendChild(h('button', { class: 'fa-add', type: 'button', onclick: function () { addItem(false); } }, icon('plus'), 'Add ' + sing));
    el.appendChild(wrap);
  }

  function renderCard(arr, i, listPath, sing) {
    var it = arr[i];
    var path = listPath.concat(i);
    var open = isObj(it) && S.expanded.has(it);
    var card = h('div', { class: 'fa-card' + (open ? ' open' : '') + (S.justAdded === it ? ' fa-enter' : ''), 'data-path': ps(path) });
    var bodyId = nextId('cb');
    var thumb = h('span', { class: 'fa-card-thumb' });
    var tB = h('b'), tS = h('small');
    var titleBtn = h('button', { class: 'fa-card-title', type: 'button', 'aria-expanded': String(open), 'aria-controls': bodyId }, tB, tS);
    function refresh() {
      tB.textContent = cardTitle(arr[i], i);
      var sub = cardSub(arr[i]); tS.textContent = sub; tS.style.display = sub ? '' : 'none';
      var im = cardImg(arr[i]);
      thumb.innerHTML = ''; thumb.className = 'fa-card-thumb' + (im && im.contain ? ' contain' : '');
      if (im) { var img = h('img', { src: im.src, alt: '', loading: 'lazy' }); img.addEventListener('error', function () { thumb.innerHTML = ''; thumb.textContent = (tB.textContent || '?').charAt(0).toUpperCase(); }); thumb.appendChild(img); }
      else thumb.textContent = String(i + 1);
    }
    card._refresh = refresh;
    function toggle() {
      var o = !card.classList.contains('open');
      card.classList.toggle('open', o); titleBtn.setAttribute('aria-expanded', String(o));
      if (isObj(it)) { if (o) S.expanded.add(it); else S.expanded.delete(it); }
      if (o) { var ta = body.querySelectorAll('textarea'); Array.prototype.forEach.call(ta, function (t) { t.dispatchEvent(new Event('fa-grow')); t.style.height = 'auto'; t.style.height = Math.max(t.classList.contains('fa-textarea') && t.closest('.fa-rowi') ? 44 : 84, t.scrollHeight + 2) + 'px'; }); }
    }
    titleBtn.addEventListener('click', toggle);
    function move(to, act) {
      if (to < 0 || to >= arr.length) return;
      var x = arr.splice(i, 1)[0]; arr.splice(to, 0, x); changed();
      rerender('[data-path="' + ps(listPath.concat(to)) + '"] [data-act="' + act + '"]');
      var moved = S.els.body.querySelector('[data-path="' + ps(listPath.concat(to)) + '"]');
      if (moved) { moved.classList.add('fa-flash'); if (!moved.querySelector('[data-act="' + act + '"]:not([disabled])')) { var tb = moved.querySelector('.fa-card-title'); if (tb) tb.focus({ preventScroll: true }); } }
    }
    function del() {
      var title = cardTitle(it, i);
      card.classList.add('fa-leave');
      setTimeout(function () {
        var idx = arr.indexOf(it); if (idx < 0) return;
        arr.splice(idx, 1); changed(); rerender();
        toast('Deleted “' + trunc(title, 40) + '”', { action: { label: 'Undo', fn: function () { arr.splice(Math.min(idx, arr.length), 0, it); changed(); rerender(); toast('Restored “' + trunc(title, 40) + '”'); } } });
      }, 180);
    }
    function dup() {
      var c = clone(it);
      if (isObj(c) && typeof c.id === 'string' && c.id) c.id = uniqueId(arr, c.id.replace(/-[a-z0-9]{4}$/, '') || 'item');
      if (isObj(c) && typeof c.title === 'string' && c.title) c.title += ' (copy)';
      else if (isObj(c) && typeof c.name === 'string' && c.name) c.name += ' (copy)';
      arr.splice(i + 1, 0, c); if (isObj(c)) S.expanded.add(c); S.justAdded = c; changed(); rerender();
      toast('Duplicated');
    }
    var grip = h('span', { class: 'fa-grip', title: 'Drag to reorder', 'aria-hidden': 'true' }, icon('grip'));
    var head = h('div', { class: 'fa-card-head' }, grip, thumb, titleBtn,
      h('button', { class: 'fa-ibtn', type: 'button', 'data-act': 'up', 'aria-label': 'Move ' + cardTitle(it, i) + ' up', title: 'Move up', disabled: i === 0, onclick: function () { move(i - 1, 'up'); } }, icon('up')),
      h('button', { class: 'fa-ibtn', type: 'button', 'data-act': 'down', 'aria-label': 'Move ' + cardTitle(it, i) + ' down', title: 'Move down', disabled: i === arr.length - 1, onclick: function () { move(i + 1, 'down'); } }, icon('down')),
      h('button', { class: 'fa-ibtn', type: 'button', tabindex: '-1', 'aria-hidden': 'true', onclick: toggle }, icon('down', 'fa-chev')));
    var body = h('div', { class: 'fa-card-body', id: bodyId });
    body.appendChild(h('div', { class: 'fa-card-tools' },
      h('button', { class: 'fa-btn fa-btn-ghost', type: 'button', onclick: dup }, icon('copy'), 'Duplicate'),
      h('button', { class: 'fa-btn fa-btn-danger-ghost', type: 'button', 'data-act': 'delete', onclick: del }, icon('trash'), 'Delete ' + sing)));
    var fieldsEl = h('div', { class: 'fa-fields' });
    if (isObj(it)) renderChildren(fieldsEl, it, path);
    else renderField(fieldsEl, it, path, arr);
    body.appendChild(fieldsEl);
    card.appendChild(head); card.appendChild(body);
    refresh();

    // drag & drop reorder (mouse / trackpad)
    grip.addEventListener('pointerdown', function () { card.draggable = true; });
    grip.addEventListener('pointerup', function () { card.draggable = false; });
    card.addEventListener('dragstart', function (e) {
      if (!card.draggable) return;
      e.stopPropagation(); S.drag = { arr: arr, from: i };
      e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch (x) { }
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', function () { card.draggable = false; card.classList.remove('dragging'); S.drag = null; clearDrop(card.parentElement || card); });
    card.addEventListener('dragover', function (e) {
      if (!S.drag || S.drag.arr !== arr) return; e.preventDefault(); e.stopPropagation();
      var r = card.getBoundingClientRect(); var after = e.clientY > r.top + r.height / 2;
      clearDrop(card.parentElement); card.classList.add(after ? 'drop-after' : 'drop-before');
    });
    card.addEventListener('drop', function (e) {
      if (!S.drag || S.drag.arr !== arr) return; e.preventDefault(); e.stopPropagation();
      var r = card.getBoundingClientRect(); var after = e.clientY > r.top + r.height / 2;
      var from = S.drag.from, to = i + (after ? 1 : 0); if (from < to) to--;
      S.drag = null; clearDrop(card.parentElement);
      if (from === to) return;
      var x = arr.splice(from, 1)[0]; arr.splice(to, 0, x); changed(); rerender();
      var moved = S.els.body.querySelector('[data-path="' + ps(listPath.concat(to)) + '"]'); if (moved) moved.classList.add('fa-flash');
      toast('Moved');
    });
    return card;
  }

  /* ---------- Google Drive ---------- */
  function apiKeyHelp() {
    return h('div', { class: 'fa-help' },
      h('h4', null, icon('help'), 'How to get a Google Drive API key'),
      h('ol', null,
        h('li', null, 'Open ', h('b', { text: 'console.cloud.google.com' }), ' → ', h('b', { text: 'New project' }), '.'),
        h('li', null, h('b', { text: 'APIs & Services' }), ' → ', h('b', { text: 'Enable APIs' }), ' → enable ', h('b', { text: 'Google Drive API' }), '.'),
        h('li', null, h('b', { text: 'Credentials' }), ' → ', h('b', { text: 'Create credentials → API key' }), '.'),
        h('li', null, h('b', { text: 'Restrict key' }), ': API restrictions = Google Drive API; Website restrictions = your domain(s), e.g. ', h('code', { text: 'https://yourdomain.com/*' }), ' and ', h('code', { text: 'https://*.vercel.app/*' }), '.'),
        h('li', { text: 'Paste the key below. It is visible in the website’s code, which is normal; the restrictions keep it safe.' })));
  }
  function driveFolderId(link) {
    var s = String(link || '').trim(); var m;
    if ((m = s.match(/\/folders\/([\w-]{10,})/))) return m[1];
    if ((m = s.match(/[?&]id=([\w-]{10,})/))) return m[1];
    if (/^[\w-]{20,}$/.test(s)) return s;
    return '';
  }
  function driveList(id, key) {
    var url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent("'" + id + "' in parents and trashed=false") + '&key=' + encodeURIComponent(key) + '&fields=' + encodeURIComponent('files(id,name,mimeType)') + '&pageSize=1000';
    return fetch(url).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok) return j.files || [];
        var msg = (j.error && j.error.message) || ('HTTP ' + r.status); var low = msg.toLowerCase();
        var reasons = JSON.stringify(j.error || {}).toLowerCase();
        if (low.indexOf('api key not valid') >= 0 || reasons.indexOf('api_key_invalid') >= 0) throw new Error('API key is not valid. Check it in Settings.');
        if (reasons.indexOf('referer') >= 0 || reasons.indexOf('referrer') >= 0 || low.indexOf('blocked') >= 0) throw new Error('API key is restricted: this website address is not allowed in the key’s Website restrictions (or Drive API is not allowed).');
        if (low.indexOf('has not been used') >= 0 || low.indexOf('disabled') >= 0) throw new Error('Google Drive API is not enabled for this key’s project.');
        if (r.status === 404) throw new Error('Folder not found, or not shared as ‘Anyone with the link’.');
        throw new Error('Google said: ' + msg);
      });
    }, function () { throw new Error('Could not reach Google. Check your internet connection.'); });
  }
  function checkDriveFolder(link) {
    var id = driveFolderId(link);
    if (!id) return Promise.reject(new Error('That doesn’t look like a Google Drive folder link (…/drive/folders/…).'));
    var key = S.draft && S.draft.settings && S.draft.settings.googleApiKey;
    if (!key) return Promise.reject(new Error('API key missing: add your Google Drive API key in Settings first.'));
    var isFolder = function (f) { return f.mimeType === 'application/vnd.google-apps.folder'; };
    return driveList(id, key).then(function (files) {
      var subs = files.filter(isFolder);
      return Promise.all(subs.slice(0, 30).map(function (s) { return driveList(s.id, key).catch(function () { return []; }); })).then(function (lists) {
        var all = files.concat.apply(files, lists);
        var photos = all.filter(function (f) { return /^image\//.test(f.mimeType); }).length;
        var videos = all.filter(function (f) { return /^video\//.test(f.mimeType); }).length;
        if (!files.length) throw new Error('Nothing visible: the folder is empty or not shared as ‘Anyone with the link – Viewer’.');
        return '✓ ' + subs.length + ' album' + (subs.length === 1 ? '' : 's') + ', ' + photos + ' photo' + (photos === 1 ? '' : 's') + ', ' + videos + ' video' + (videos === 1 ? '' : 's') + ' found';
      });
    });
  }

  /* ---------- Google Form help ---------- */
  function formHelp() {
    return h('div', { class: 'fa-help' },
      h('h4', null, icon('help'), 'How this form works'),
      h('p', { text: 'Visitors fill in the form on your website and the answers are sent straight to your Google Form. Each question below must have the matching “Entry ID” from Google.' }),
      h('details', null, h('summary', { text: 'How do I find the entry IDs?' }),
        h('ol', null,
          h('li', { text: 'Open your Google Form in edit mode.' }),
          h('li', null, 'Click the ', h('b', { text: '⋮' }), ' menu (top right) → ', h('b', { text: 'Get pre-filled link' }), '.'),
          h('li', { text: 'Type a dummy answer in every question (e.g. “aaa”).' }),
          h('li', null, 'Click ', h('b', { text: 'Get link' }), ' → ', h('b', { text: 'Copy link' }), ' and paste it somewhere you can read it.'),
          h('li', null, 'The link contains parts like ', h('code', { text: 'entry.103526039=aaa' }), '. The numbers after ', h('code', { text: 'entry.' }), ' are the entry IDs, in the same order as your questions.'),
          h('li', null, 'The “Form submit address” is your form link with ', h('code', { text: '/viewform' }), ' replaced by ', h('code', { text: '/formResponse' }), '.'))),
      h('details', null, h('summary', { text: 'Where do I see the answers? (Excel)' }),
        h('ol', null,
          h('li', null, 'Open the Google Form → ', h('b', { text: 'Responses' }), ' tab.'),
          h('li', null, 'Click ', h('b', { text: 'Link to Sheets' }), ' (creates a Google Sheet that fills itself).'),
          h('li', null, 'In the sheet: ', h('b', { text: 'File → Download → Microsoft Excel (.xlsx)' }), '.'))));
  }

  /* ------------------------------------------------------------------ */
  /* Lists comparison / merge                                            */
  /* ------------------------------------------------------------------ */
  function identOf(it) {
    if (!isObj(it)) return '';
    var v = it.id || it.title || it.name || it.label || it.year || '';
    return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  }
  function itemLabel(it, i) {
    var t = isObj(it) ? (it.title || it.name || it.label || it.year || it.id || '') : '';
    return t ? '“' + trunc(String(t), 30) + '”' : 'item ' + (i + 1);
  }
  function joinLabel(parts) {
    parts = parts.slice();
    if (parts.length > 1) { var a = String(parts[0]).toLowerCase(), b = String(parts[1]).toLowerCase(); if (b.indexOf(a) >= 0 || a.indexOf(b) >= 0) parts.shift(); }
    return parts.join(' → ');
  }
  function collectLists(node, key, label, out) {
    if (Array.isArray(node)) {
      out[key] = { len: node.length, label: joinLabel(label), arr: node };
      var seen = {};
      node.forEach(function (it, i) {
        if (!isObj(it)) return;
        var id = identOf(it); var k = id ? id : '#' + i;
        if (seen[k] != null) { seen[k]++; k += '~' + seen[k]; } else seen[k] = 0;
        collectLists(it, key + '[' + k + ']', label.concat(itemLabel(it, i)), out);
      });
    } else if (isObj(node)) {
      Object.keys(node).forEach(function (k) {
        var lab = key ? (LABELS_BY_PATH[(key.replace(/\[[^\]]*\]/g, '.*') + '.' + k)] || friendlyKey(k)) : secInfo(k).label;
        collectLists(node[k], key ? key + '.' + k : k, label.concat(lab), out);
      });
    }
    return out;
  }
  function findShrunk(live, draft) {
    var L = collectLists(live, '', [], {}), D = collectLists(draft, '', [], {});
    var res = [];
    Object.keys(L).forEach(function (k) {
      if (D[k] && D[k].len < L[k].len) res.push({ key: k, label: L[k].label, live: L[k].len, draft: D[k].len, liveArr: L[k].arr, draftArr: D[k].arr });
    });
    return res;
  }
  function sameItem(a, b) {
    if (!isObj(a) || !isObj(b)) {
      if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
      return a === b;
    }
    if (a.id && b.id) return a.id === b.id;
    if (JSON.stringify(a) === JSON.stringify(b)) return true;
    var ia = identOf(a); return !!ia && ia === identOf(b);
  }
  function addMissing(dArr, lArr) {
    var n = 0;
    lArr.forEach(function (li, idx) {
      if (!dArr.some(function (d) { return sameItem(d, li); })) { dArr.splice(Math.min(idx, dArr.length), 0, clone(li)); n++; }
    });
    return n;
  }
  function planMerge(d, l, label, plan) {
    if (Array.isArray(l) && Array.isArray(d)) {
      var missing = [];
      l.forEach(function (li, idx) {
        var m = null;
        for (var j = 0; j < d.length; j++) if (sameItem(d[j], li)) { m = d[j]; break; }
        if (m === null) missing.push({ item: li, idx: idx });
        else if (isObj(m) && isObj(li)) planMerge(m, li, label.concat(itemLabel(li, idx)), plan);
      });
      if (missing.length) plan.push({ arr: d, missing: missing, label: joinLabel(label) });
    } else if (isObj(l) && isObj(d)) {
      Object.keys(l).forEach(function (k) {
        var lab = label.length ? friendlyKey(k) : secInfo(k).label;
        if (!(k in d)) plan.push({ obj: d, key: k, value: l[k], label: joinLabel(label.concat(lab)) });
        else planMerge(d[k], l[k], label.concat(lab), plan);
      });
    }
    return plan;
  }
  function applyPlan(plan) {
    var n = 0;
    plan.forEach(function (p) {
      if (p.arr) p.missing.forEach(function (m) { p.arr.splice(Math.min(m.idx, p.arr.length), 0, clone(m.item)); n++; });
      else { p.obj[p.key] = clone(p.value); n++; }
    });
    return n;
  }
  function describeMissing(m) {
    var it = m.item;
    if (isObj(it)) return identOf(it) || 'an item';
    if (isDataUrl(it)) return 'an uploaded photo';
    return trunc(String(it).replace(/^https?:\/\/[^/]+\//, ''), 40);
  }

  function addFromLiveTool() {
    var p = S.live ? Promise.resolve(S.live) : fetchLive();
    fetchLive().then(function (j) { S.live = j; return j; }, function () { return p; }).then(function (live) {
      if (!live) throw new Error('no live content');
      var plan = planMerge(S.draft, live, [], []);
      if (!plan.length) { modal({ title: 'Nothing missing', icon: 'check', tone: 'ok', body: 'Everything on the live site is already in your draft.', actions: [{ label: 'OK', kind: 'primary', value: true }] }); return; }
      var total = plan.reduce(function (n, x) { return n + (x.arr ? x.missing.length : 1); }, 0);
      var list = h('ul', { class: 'fa-shrink' });
      plan.forEach(function (x) {
        var names = x.arr ? x.missing.map(describeMissing) : [friendlyKey(x.key)];
        list.appendChild(h('li', { style: { background: 'var(--blue-soft)', color: 'var(--blue)', flexDirection: 'column', alignItems: 'flex-start' } },
          h('b', { style: { whiteSpace: 'normal' }, text: x.label + ' (+' + names.length + ')' }),
          h('span', { style: { fontSize: '12.5px', color: 'var(--muted)' }, text: names.slice(0, 5).join(' · ') + (names.length > 5 ? ' · and ' + (names.length - 5) + ' more' : '') })));
      });
      return modal({
        title: 'Add ' + total + ' item' + (total === 1 ? '' : 's') + ' from the live site?', icon: 'restore', wide: true,
        body: [h('p', { text: 'These are on the live website but not in your draft. If you changed the text of an item, the old version may show up here too.' }), list],
        actions: [{ label: 'Cancel', value: false }, { label: 'Add them to my draft', kind: 'primary', value: true, icon: 'plus' }]
      }).then(function (ok) {
        if (!ok) return;
        var n = applyPlan(plan); changed(); rerender();
        toast('Added ' + n + ' item' + (n === 1 ? '' : 's') + ' from the live site');
      });
    }).catch(function (e) { toast('Couldn’t load the live content.json (' + (e && e.message || e) + ')', { kind: 'err' }); });
  }

  /* ------------------------------------------------------------------ */
  /* Download                                                            */
  /* ------------------------------------------------------------------ */
  function downloadFlow() {
    flushSave();
    var btn = document.getElementById('fa-download'); if (btn) btn.disabled = true;
    fetchLive().then(function (j) { S.live = j; }, function () { }).then(function () {
      var live = S.live;
      var shrunk = live ? findShrunk(live, S.draft) : [];
      var step = Promise.resolve('go');
      if (shrunk.length) {
        var list = h('ul', { class: 'fa-shrink' });
        shrunk.forEach(function (s) { list.appendChild(h('li', null, h('span', { text: s.label }), h('b', { text: 'live ' + s.live + ' → your file ' + s.draft }))); });
        step = modal({
          title: 'Some lists are shorter than on the live site', icon: 'alert', tone: 'danger', wide: true,
          body: [h('p', { text: 'Your file has fewer items than the website has right now. If you didn’t delete these on purpose, add them back before publishing.' }), list,
            h('p', { class: 'fa-note', text: 'This can happen if someone else published changes while you were editing an older draft.' })],
          actions: [{ label: 'Cancel', value: null }, { label: 'Download anyway', value: 'anyway', kind: 'danger-ghost' }, { label: 'Add missing items from live site', value: 'merge', kind: 'primary', icon: 'restore', autofocus: true }]
        });
      }
      return step.then(function (choice) {
        if (!choice) return;
        if (choice === 'merge') {
          var n = 0;
          shrunk.sort(function (a, b) { return a.key.length - b.key.length; }).forEach(function (s) { n += addMissing(s.draftArr, s.liveArr); });
          rerender();
          toast('Added ' + n + ' missing item' + (n === 1 ? '' : 's') + ' back from the live site');
        }
        var big = S.bytes > GITHUB_LIMIT ? Promise.resolve(null) : Promise.resolve('ok');
        var size = new Blob([jsonText()]).size;
        if (size > GITHUB_LIMIT) {
          big = modal({ title: 'This file is too big for GitHub', icon: 'alert', tone: 'danger', body: 'content.json is ' + fmtBytes(size) + '. GitHub’s web upload accepts files up to 25 MB. Remove or replace some uploaded photos first.', actions: [{ label: 'Show biggest photos', value: 'size', kind: 'primary' }, { label: 'Download anyway', value: 'ok', kind: 'danger-ghost' }] });
        }
        return big.then(function (v) {
          if (v === 'size') { showSizeDetails(); return; }
          if (v !== 'ok') return;
          var meta = S.draft.meta = isObj(S.draft.meta) ? S.draft.meta : {};
          var lv = live && live.meta && Number(live.meta.version) || 0;
          meta.version = Math.max(Number(meta.version) || 0, lv) + 1;
          meta.updated = todayISO();
          changed(); flushSave();
          saveFile(jsonText(), 'content.json');
          if (S.section === 'meta') rerender();
          afterDownload();
        });
      });
    }).catch(function (e) { toast('Download failed: ' + (e && e.message || e), { kind: 'err' }); })
      .then(function () { if (btn) btn.disabled = false; });
  }
  function saveFile(text, name) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: name, style: { display: 'none' } });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }
  function afterDownload() {
    modal({
      title: 'content.json downloaded', icon: 'check', tone: 'ok',
      body: [h('p', null, 'Version ', h('b', { text: String(S.draft.meta.version) }), ' · ' + fmtBytes(S.bytes || new Blob([jsonText()]).size) + '. Your website changes when you upload this file to GitHub.'),
        h('p', { class: 'fa-note', text: 'Keep the downloaded file as a backup. You can always open it again with “Import”.' })],
      actions: [{ label: 'Done', value: false }, { label: 'Show me how to publish', value: true, kind: 'primary', icon: 'help', autofocus: true }]
    }).then(function (v) { if (v) showPublishHelp(); });
  }

  /* ------------------------------------------------------------------ */
  /* Import                                                              */
  /* ------------------------------------------------------------------ */
  function pickImport(fromEmpty) {
    var inp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    inp.addEventListener('change', function () {
      var fl = inp.files && inp.files[0]; inp.remove(); if (!fl) return;
      var rd = new FileReader();
      rd.onload = function () { importText(String(rd.result || ''), fl, fromEmpty); };
      rd.onerror = function () { toast('Couldn’t read that file.', { kind: 'err' }); };
      rd.readAsText(fl);
    });
    document.body.appendChild(inp);
    inp.click();
  }
  function summaryRows(obj) {
    var rows = [];
    sectionKeys().concat(Object.keys(obj || {})).forEach(function (k) {
      if (rows.some(function (r) { return r.k === k; })) return;
      var info = SECTIONS[k];
      if (k === 'nav') rows.push({ k: k, label: 'Menu links', path: ['nav'] });
      else if (info && info.list) {
        var lp = [k].concat(info.list.split('.')), ll = labelFor(lp);
        var a = info.label.toLowerCase(), b = ll.toLowerCase();
        rows.push({ k: k, label: (b.indexOf(a) >= 0 || a.indexOf(b) >= 0) ? ll : info.label + ': ' + b, path: lp });
      }
    });
    rows.push({ k: '__photos', label: 'Gallery: photos (all albums)', fn: function (o) { var a = o && o.gallery && o.gallery.albums; return Array.isArray(a) ? a.reduce(function (n, x) { return n + ((x && x.images && x.images.length) || 0); }, 0) : '—'; } });
    return rows;
  }
  function countFor(o, r) { if (r.fn) return r.fn(o); var v = getIn(o, r.path); return Array.isArray(v) ? v.length : '—'; }
  function importText(text, fl, fromEmpty) {
    var data;
    try { data = JSON.parse(text); } catch (e) { modal({ title: 'That file isn’t valid', icon: 'alert', tone: 'danger', body: 'It could not be read as JSON (' + e.message + '). Make sure you chose a content.json downloaded from this admin.', actions: [{ label: 'OK', kind: 'primary', value: 1 }] }); return; }
    var known = ['brand', 'hero', 'about', 'gallery', 'team', 'contact', 'training', 'enquiry'];
    var hits = isObj(data) ? known.filter(function (k) { return k in data; }).length : 0;
    if (hits < 3) { modal({ title: 'This doesn’t look like the website’s content.json', icon: 'alert', tone: 'danger', body: 'The file is valid JSON but doesn’t contain the expected sections (brand, hero, gallery, team…). Nothing was changed.', actions: [{ label: 'OK', kind: 'primary', value: 1 }] }); return; }
    var cur = S.draft || {};
    var tbl = h('table', { class: 'fa-tbl' }, h('thead', null, h('tr', null, h('th', { text: 'List' }), h('th', { text: S.draft ? 'Now' : '', class: 'num' }), h('th', { text: 'In file', class: 'num' }))));
    var tb = h('tbody'); tbl.appendChild(tb);
    summaryRows(data).forEach(function (r) {
      var a = S.draft ? countFor(cur, r) : '', b = countFor(data, r);
      tb.appendChild(h('tr', { class: typeof a === 'number' && typeof b === 'number' && b < a ? 'less' : '' }, h('td', { text: r.label }), h('td', { class: 'num', text: String(a) }), h('td', { class: 'num', text: String(b) })));
    });
    var size = new Blob([text]).size;
    modal({
      title: 'Use this file as your draft?', icon: 'fileup', wide: true,
      body: [h('p', null, h('b', { text: fl.name }), ' · ' + fmtBytes(size) + (data.meta ? ' · version ' + (data.meta.version != null ? data.meta.version : '?') + (data.meta.updated ? ', ' + data.meta.updated : '') : '')),
        tbl, h('p', { class: 'fa-note', text: 'Your current draft will be replaced. Lists in red have fewer items than your current draft. The website itself doesn’t change until you download and publish.' })],
      actions: [{ label: 'Cancel', value: false }, { label: 'Use this file', value: true, kind: 'primary', icon: 'check', autofocus: true }]
    }).then(function (ok) {
      if (!ok) return;
      S.draft = data; S.expanded = new WeakSet();
      if (fromEmpty || !S.els.app) { renderApp(); }
      changed(); flushSave();
      S.search = ''; if (S.els.search) S.els.search.value = '';
      renderEditor(); updateRail(); sendPreview(); updateStatus();
      toast('Imported ' + fl.name + '. It is now your draft.');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Size details                                                        */
  /* ------------------------------------------------------------------ */
  function collectImages(o, path, out) {
    if (typeof o === 'string') { if (isDataUrl(o) && /^data:image\//.test(o)) out.push({ path: path, bytes: o.length, src: o }); }
    else if (Array.isArray(o)) o.forEach(function (x, i) { collectImages(x, path.concat(i), out); });
    else if (isObj(o)) Object.keys(o).forEach(function (k) { collectImages(o[k], path.concat(k), out); });
    return out;
  }
  function prettyPath(path) {
    var parts = [], node = S.draft;
    path.forEach(function (p, i) {
      var parent = node; node = node == null ? undefined : node[p];
      if (i === 0) parts.push(secInfo(p).label);
      else if (typeof p === 'number') { if (isObj(node)) parts.push(itemLabel(node, p)); else parts.push('#' + (p + 1)); }
      else parts.push(friendlyKey(p));
    });
    return parts.join(' → ');
  }
  function showSizeDetails() {
    updateStatus();
    var imgs = collectImages(S.draft, [], []).sort(function (a, b) { return b.bytes - a.bytes; });
    var total = imgs.reduce(function (n, x) { return n + x.bytes; }, 0);
    var lvl = S.bytes > DANGER_BYTES ? 'danger' : S.bytes > WARN_BYTES ? 'warn' : 'ok';
    var body = [
      h('p', null, 'content.json is ', h('b', { text: fmtBytes(S.bytes) }), '. Uploaded photos make up ', h('b', { text: fmtBytes(total) }), ' (' + imgs.length + ' photo' + (imgs.length === 1 ? '' : 's') + ').'),
      h('div', { class: 'fa-sizewarn' + (lvl === 'danger' ? ' danger' : ''), style: lvl === 'ok' ? { background: 'var(--ok-soft)', color: 'var(--ok)' } : null, text: lvl === 'danger' ? 'Too large: GitHub web upload limit is 25 MB; remove photos.' : lvl === 'warn' ? 'Large: pages load slower; consider fewer/smaller photos.' : 'Good size. Under 5 MB keeps the website fast.' })
    ];
    if (imgs.length) {
      body.push(h('h3', { class: 'fa-h-sub', style: { margin: '4px 0 0' }, text: 'Biggest photos' }));
      var list = h('div', { class: 'fa-big-list' });
      imgs.slice(0, 5).forEach(function (x) {
        list.appendChild(h('div', { class: 'fa-big-item' }, h('img', { src: x.src, alt: '' }),
          h('div', null, h('b', { text: prettyPath(x.path) }), h('span', { style: { color: 'var(--muted)' }, text: fmtBytes(x.bytes) })),
          h('button', { class: 'fa-btn fa-btn-soft', type: 'button', 'data-jump': ps(x.path), style: { minHeight: '40px' } }, 'Show')));
      });
      body.push(list);
    } else body.push(h('p', { class: 'fa-note', text: 'No uploaded photos yet. Images that are web links don’t add to the file size.' }));
    modal({
      title: 'File size', icon: 'weight', body: body, wide: true,
      onOpen: function (close, box) { Array.prototype.forEach.call(box.querySelectorAll('[data-jump]'), function (b) { b.addEventListener('click', function () { close(null); jumpTo(b.getAttribute('data-jump').split('.').map(function (p) { return /^\d+$/.test(p) ? Number(p) : p; })); }); }); },
      actions: [{ label: 'Close', value: null, kind: 'primary' }]
    });
  }
  function jumpTo(path) {
    // expand every card on the way
    var node = S.draft;
    for (var i = 0; i < path.length; i++) { node = node == null ? undefined : node[path[i]]; if (typeof path[i] === 'number' && isObj(node)) S.expanded.add(node); }
    if (isPhoneLayout()) setView('edit');
    openSection(path[0]);
    setTimeout(function () {
      var el = null;
      for (var n = path.length; n > 0 && !el; n--) el = S.els.body.querySelector('[data-path="' + ps(path.slice(0, n)) + '"]');
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.remove('fa-flash'); void el.offsetWidth; el.classList.add('fa-flash'); }
    }, 80);
  }

  /* ------------------------------------------------------------------ */
  /* Publish help                                                        */
  /* ------------------------------------------------------------------ */
  function showPublishHelp() {
    var repo = ''; try { repo = localStorage.getItem(REPO_KEY) || ''; } catch (e) { }
    var repoIn = h('input', { class: 'fa-input', type: 'url', value: repo, placeholder: 'https://github.com/your-account/your-repo', inputmode: 'url', 'aria-label': 'Your GitHub repository link' });
    var repoLink = h('a', { class: 'fa-test', target: '_blank', rel: 'noopener' }, 'Open', icon('external'));
    function updRepo() { var v = repoIn.value.trim(); try { localStorage.setItem(REPO_KEY, v); } catch (e) { } if (/^https?:\/\//.test(v)) { repoLink.href = v; repoLink.removeAttribute('aria-disabled'); } else { repoLink.removeAttribute('href'); repoLink.setAttribute('aria-disabled', 'true'); } }
    repoIn.addEventListener('input', updRepo); updRepo();
    var K = function (t) { return h('span', { class: 'fa-kbd', text: t }); };
    var computer = h('ol', { class: 'fa-steps' },
      h('li', null, h('span', null, 'Click ', K('Download content.json'), ' (top right). The file goes to your ', h('b', { text: 'Downloads' }), ' folder. Keep it: it is also your backup.')),
      h('li', null, h('span', null, 'Go to ', h('b', { text: 'github.com' }), ', sign in, and open your website’s repository (github.com/<your-account>/<your-repo>, link above).')),
      h('li', null, h('span', null, 'Above the list of files, click ', K('Add file'), ' → ', K('Upload files'), '.')),
      h('li', null, h('span', null, 'Drag ', h('b', { text: 'content.json' }), ' from Downloads onto the page (or click ', K('choose your files'), '). It replaces the old content.json. That is what you want.')),
      h('li', null, h('span', null, 'Scroll down. Optionally type a short note like “Update gallery”, then click the green ', K('Commit changes'), ' button.')),
      h('li', null, h('span', null, 'Vercel sees the change and redeploys automatically. Wait about ', h('b', { text: '1 minute' }), '.')),
      h('li', null, h('span', null, 'Open your website and refresh (', K('Ctrl + F5'), ' on Windows, ', K('Cmd + Shift + R'), ' on Mac). Done!')));
    var phone = h('ol', { class: 'fa-steps' },
      h('li', null, h('span', null, 'Tap ', K('content.json'), ' (Download) at the top. iPhone: tap ', K('Download'), '; it is saved in ', h('b', { text: 'Files → Downloads' }), '. Android: it goes to ', h('b', { text: 'Downloads' }), '.')),
      h('li', null, h('span', null, 'Open your repository link in the ', h('b', { text: 'browser' }), ' (Safari or Chrome), not the GitHub app. Sign in.')),
      h('li', null, h('span', null, 'If you can’t see “Add file”, switch to the desktop site: Safari ', K('aA'), ' → ', K('Request Desktop Website'), '; Chrome ', K('⋮'), ' → ', K('Desktop site'), '.')),
      h('li', null, h('span', null, 'Tap ', K('Add file'), ' → ', K('Upload files'), '. On small screens it may be under the ', K('⋯'), ' menu next to the green Code button.')),
      h('li', null, h('span', null, 'Tap ', K('choose your files'), ' → ', K('Browse'), ' / ', K('Files'), ' → Downloads → ', h('b', { text: 'content.json' }), '.')),
      h('li', null, h('span', null, 'Scroll down and tap ', K('Commit changes'), '.')),
      h('li', null, h('span', null, 'Wait about 1 minute, open your website and pull down to refresh.')));
    var tabC = h('button', { type: 'button', 'aria-pressed': 'true' }, icon('desktop'), 'On a computer');
    var tabP = h('button', { type: 'button', 'aria-pressed': 'false' }, icon('mobile'), 'On a phone');
    function sel(p) { tabC.setAttribute('aria-pressed', String(!p)); tabP.setAttribute('aria-pressed', String(p)); computer.classList.toggle('fa-hidden', p); phone.classList.toggle('fa-hidden', !p); }
    tabC.addEventListener('click', function () { sel(false); }); tabP.addEventListener('click', function () { sel(true); });
    sel(isPhoneLayout());
    modal({
      title: 'How to publish your changes', icon: 'help', wide: true,
      body: [
        h('p', { text: 'Your edits are only on this device until you upload the new content.json to GitHub. It takes about 2 minutes.' }),
        h('label', { class: 'fa-field' }, h('span', { class: 'fa-label', text: 'Your GitHub repository (saved on this device)' }), h('div', { class: 'fa-row' }, repoIn, repoLink)),
        h('div', { class: 'fa-seg', role: 'group', 'aria-label': 'Device', style: { alignSelf: 'flex-start' } }, tabC, tabP),
        computer, phone,
        h('div', { class: 'fa-note' }, h('b', { text: 'Tips: ' }), 'If GitHub says the file is too big (over 25 MB), remove some uploaded photos and download again. Every downloaded content.json is a full backup. To go back to an older version, upload that file the same way (or open it here with Import).')
      ],
      actions: [{ label: 'Got it', value: null, kind: 'primary' }]
    });
  }

  /* ------------------------------------------------------------------ */
  /* Global drop guard (don't let the browser open dropped files)        */
  /* ------------------------------------------------------------------ */
  function dropGuard(e) {
    if (!S.started || !hasFiles(e)) return;
    e.preventDefault();
    if (e.type === 'drop') toast('Drop photos onto a photo box or the “Drop training photos here” area.', { kind: 'warn' });
  }

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */
  function start() {
    if (S.started) return;
    S.started = true;
    injectStyles();
    document.documentElement.classList.add('fa-admin-html');
    try { document.title = 'Admin · First Aid Centre of Sweden'; } catch (e) { }
    if (!document.querySelector('meta[name="viewport"]')) {
      var mv = document.createElement('meta'); mv.name = 'viewport'; mv.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
      document.head.appendChild(mv);
    }
    document.body.innerHTML = '';
    document.body.className = 'fa-admin-body';
    document.body.removeAttribute('style');
    S.root = h('div', { id: 'fa-admin', class: 'fa-admin' });
    document.body.appendChild(S.root);
    window.addEventListener('dragover', dropGuard);
    window.addEventListener('drop', dropGuard);
    window.addEventListener('resize', function () { debounce('fit', fitPreview, 60); });
    window.addEventListener('hashchange', function () { if (location.hash !== '#admin') { flushSave(); location.reload(); } });
    window.addEventListener('pagehide', flushSave);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushSave(); });
    if (!cryptoOK()) { renderNoCrypto(); return; }
    if (isLoggedIn()) boot(false); else renderLogin();
  }

  window.FAAdmin = { start: start, __loaded: true, version: '1.0.0' };
  Object.defineProperty(window.FAAdmin, 'started', { get: function () { return S.started; } });

  function autoStart() { if (location.hash === '#admin' && !S.started) start(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(autoStart, 0); });
  else setTimeout(autoStart, 0);
})();
