/**
 * First Aid Centre of Sweden – CERTIFICATES (keep this spreadsheet private!)
 * Paste this whole file into the PRIVATE Certificates sheet: Extensions -> Apps Script. Save, then Deploy (see README).
 * Add one row per trained person / group / organisation, then use the menu
 *   🎓 Certificates -> "Create codes for new rows" and "Email codes to new rows".
 */
var SITE_URL = 'https://firstaidswedenbd.com/';   // change if your website address is different
var CERT_SHEET = 'Certificates';
var CERT_HEADERS = ['Code', 'Full name', 'Organisation / group', 'Type', 'Course', 'Training date', 'Trainer', 'Valid until', 'Email', 'Email sent', 'Account ID', 'Password hash', 'Claimed at'];

/* ---------- sheet menu ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🎓 Certificates')
    .addItem('Set up Certificates tab', 'setupCertificates')
    .addItem('Create codes for new rows', 'createCodes')
    .addItem('Email codes to new rows', 'emailCodes')
    .addToUi();
}
function setupCertificates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CERT_SHEET) || ss.getSheets()[0];
  if (sh.getName() !== CERT_SHEET) sh.setName(CERT_SHEET);
  if (sh.getLastRow() === 0) sh.appendRow(CERT_HEADERS);
  if (!sh.getFrozenRows()) {
    sh.getRange(1, 1, 1, CERT_HEADERS.length).setFontWeight('bold').setBackground('#283090').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange('F:F').setNumberFormat('d mmmm yyyy'); sh.getRange('H:H').setNumberFormat('d mmmm yyyy');
    sh.getRange('L:L').setFontColor('#bbbbbb');
  }
  return sh;
}
function table_() {
  var sh = setupCertificates(), v = sh.getDataRange().getValues(), h = v.shift().map(String);
  var c = {}; h.forEach(function (n, i) { c[n] = i; });
  return { sh: sh, rows: v, c: c };
}
function newCode_() {
  var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = 'FACS';
  for (var g = 0; g < 3; g++) { s += '-'; for (var i = 0; i < 4; i++) s += a.charAt(Math.floor(Math.random() * a.length)); }
  return s;
}
function createCodes() {
  var t = table_(), n = 0, used = {};
  t.rows.forEach(function (r) { if (r[t.c['Code']]) used[r[t.c['Code']]] = 1; });
  t.rows.forEach(function (r, i) {
    if (r[t.c['Full name']] && !r[t.c['Code']]) {
      var code; do { code = newCode_(); } while (used[code]); used[code] = 1;
      t.sh.getRange(i + 2, t.c['Code'] + 1).setValue(code); n++;
    }
  });
  SpreadsheetApp.getActive().toast(n + ' new code(s) created.', 'Certificates');
}
function emailCodes() {
  createCodes();
  var t = table_(), n = 0;
  t.rows.forEach(function (r, i) {
    var to = String(r[t.c['Email']] || '').trim(), code = r[t.c['Code']];
    if (!to || !code || r[t.c['Email sent']]) return;
    var name = r[t.c['Full name']], course = r[t.c['Course']];
    var link = SITE_URL + '#certificate';
    MailApp.sendEmail({
      to: to,
      subject: 'Your First Aid certificate is ready',
      htmlBody: '<div style="font-family:Arial,sans-serif;max-width:560px;color:#0A0F2C">' +
        '<h2 style="color:#283090">Congratulations, ' + esc_(name) + '!</h2>' +
        '<p>You have completed <b>' + esc_(course) + '</b> with First Aid Centre of Sweden, Bangladesh.</p>' +
        '<p>Your certificate code:</p><p style="font-size:24px;font-weight:bold;letter-spacing:2px;background:#FFF4DE;padding:12px 16px;border-radius:8px;display:inline-block">' + esc_(code) + '</p>' +
        '<p><a href="' + link + '" style="background:#283090;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;display:inline-block">Claim your certificate</a></p>' +
        '<p style="font-size:13px;color:#555">On the website, enter the code, choose a login ID and password, then view and download your certificate as a PDF.</p></div>'
    });
    t.sh.getRange(i + 2, t.c['Email sent'] + 1).setValue(new Date()); n++;
  });
  SpreadsheetApp.getActive().toast(n + ' email(s) sent.', 'Certificates');
}
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

/* ---------- web endpoint ---------- */
function doPost(e) {
  var data = {};
  try { data = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json({ ok: false, error: 'bad_request' }); }
  var a = data.action || 'enrol';
  if (a === 'claim') return json(claim_(data));
  if (a === 'login') return json(login_(data));
  if (a === 'verify') return json(verify_(data.code));
  return json({ ok: false, error: 'unknown_action' });
}
function doGet(e) {
  if (e && e.parameter && e.parameter.verify) return json(verify_(e.parameter.verify));
  return json({ ok: true, message: 'Receiver is running.' });
}
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function normCode_(s) { return String(s || '').toUpperCase().replace(/\s+/g, '').trim(); }
function normId_(s) { return String(s || '').toLowerCase().trim(); }
function hash_(pw, salt) {
  var d = salt + '|' + pw;
  for (var i = 0; i < 1500; i++) d = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, d + salt, Utilities.Charset.UTF_8));
  return salt + '$' + d;
}
function checkPw_(pw, stored) { stored = String(stored || ''); return !!stored && hash_(pw, stored.split('$')[0]) === stored; }
function fmt_(v) { return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'd MMMM yyyy') : String(v || ''); }
function cert_(t, r) {
  var c = t.c;
  return { code: r[c['Code']], name: r[c['Full name']], org: r[c['Organisation / group']], type: r[c['Type']], course: r[c['Course']], date: fmt_(r[c['Training date']]), trainer: r[c['Trainer']], validUntil: fmt_(r[c['Valid until']]) };
}
function throttle_(key) {
  var cache = CacheService.getScriptCache(), n = +(cache.get(key) || 0);
  return { blocked: n >= 8, fail: function () { cache.put(key, String(n + 1), 600); } };
}
function claim_(d) {
  var code = normCode_(d.code), id = normId_(d.id), pw = String(d.password || '');
  if (!code || id.length < 3 || pw.length < 6) return { ok: false, error: 'missing' };
  var th = throttle_('c_' + id); if (th.blocked) return { ok: false, error: 'too_many' };
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var t = table_(), c = t.c, row = -1, existingHash = '';
    t.rows.forEach(function (r, i) {
      if (normCode_(r[c['Code']]) === code) row = i;
      if (normId_(r[c['Account ID']]) === id && r[c['Password hash']]) existingHash = r[c['Password hash']];
    });
    if (row < 0) { th.fail(); return { ok: false, error: 'not_found' }; }
    var r = t.rows[row], owner = normId_(r[c['Account ID']]);
    if (owner && owner !== id) return { ok: false, error: 'already_claimed' };
    if (existingHash && !checkPw_(pw, existingHash)) { th.fail(); return { ok: false, error: 'wrong_password' }; }
    if (!owner) {
      var h = existingHash || hash_(pw, Utilities.getUuid().slice(0, 12));
      t.sh.getRange(row + 2, c['Account ID'] + 1).setValue(id);
      t.sh.getRange(row + 2, c['Password hash'] + 1).setValue(h);
      t.sh.getRange(row + 2, c['Claimed at'] + 1).setValue(new Date());
    } else if (!checkPw_(pw, r[c['Password hash']])) { th.fail(); return { ok: false, error: 'wrong_password' }; }
    return login_({ id: id, password: pw });
  } finally { lock.releaseLock(); }
}
function login_(d) {
  var id = normId_(d.id), pw = String(d.password || '');
  var th = throttle_('l_' + id); if (th.blocked) return { ok: false, error: 'too_many' };
  var t = table_(), c = t.c, mine = t.rows.filter(function (r) { return normId_(r[c['Account ID']]) === id; });
  if (!mine.length || !checkPw_(pw, mine[0][c['Password hash']])) { th.fail(); return { ok: false, error: 'wrong_login' }; }
  return { ok: true, id: id, certs: mine.map(function (r) { return cert_(t, r); }) };
}
function verify_(code) {
  code = normCode_(code); if (!code) return { ok: false, error: 'not_found' };
  var t = table_(), c = t.c;
  for (var i = 0; i < t.rows.length; i++) if (normCode_(t.rows[i][c['Code']]) === code) { var x = cert_(t, t.rows[i]); return { ok: true, cert: { code: x.code, name: x.name, org: x.org, course: x.course, date: x.date, validUntil: x.validUntil } }; }
  return { ok: false, error: 'not_found' };
}
