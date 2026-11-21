/**
 * First Aid Centre of Sweden – website ENROLMENTS -> this Google Sheet.
 * Paste this into the Enrolments sheet: Extensions -> Apps Script, replace everything, Save, then Deploy (see README).
 * Each enrolment from the website becomes one new row. Row 1 holds the column names.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (data._hp) return json({ ok: true }); // spam-bot trap field was filled in
    var lastCol = Math.max(1, sheet.getLastColumn());
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    Object.keys(data).forEach(function (k) {
      if (k.charAt(0) !== '_' && k !== 'action' && headers.indexOf(k) < 0) { headers.push(k); sheet.getRange(1, headers.length).setValue(k).setFontWeight('bold'); }
    });
    sheet.appendRow(headers.map(function (h) {
      if (h === 'Submitted at') return new Date();
      var v = data[h] == null ? '' : String(data[h]).slice(0, 5000);
      return /^[=+\-@]/.test(v) ? "'" + v : v; // stop formulas being injected
    }));
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
function doGet() { return json({ ok: true, message: 'Enrolment receiver is running.' }); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
