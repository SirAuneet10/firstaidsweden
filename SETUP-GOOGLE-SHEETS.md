# Google Sheets setup: enrolments + certificates
Everything is owned by **md.rahatislam.2427@gmail.com**. Do all of it on a computer, signed in as that account.

---

## Step 1: Make your own copies of the two sheets (2 minutes)
Both sheets are already shared with md.rahatislam.2427@gmail.com.

1. Sign in to Google as **md.rahatislam.2427@gmail.com**.
2. Open the enrolment sheet:
   https://docs.google.com/spreadsheets/d/1a581dhW6RsD05CXHsh9Sm4XXN_ONLc5_HWZLH19nw9k/edit
   Click **File → Make a copy** → name it **First Aid Centre of Sweden – Website Enrolments** → **Make a copy**.
   The copy opens in a new tab. **This copy is yours.** Use it from now on.
3. Open the certificates sheet:
   https://docs.google.com/spreadsheets/d/15lU6or9LtVkDoktbWLT-jW6YhdSbOtUYpTQcjqV3JMI/edit
   Click **File → Make a copy** → name it **First Aid Centre of Sweden – Certificates (PRIVATE)** → **Make a copy**.
4. Sharing on **your copies**:
   - **Enrolments copy:** **Share → General access → Anyone with the link → Editor** (as you wanted).
   - **Certificates copy:** leave it as **Restricted**. Never share it by link, because it holds logins.
5. Copy the two new sheet links (from the address bar) and send them to the developer so the README can be updated.

---

## Step 2: Enrolment sheet → receive website enrolments
In your **Enrolments copy**:
1. **Extensions → Apps Script**. A code editor opens.
2. Select all (Ctrl+A) and delete.
3. Open `google-sheet-script.gs` (in the website folder) with Notepad, copy everything and paste it into the editor.
4. Click 💾 **Save**.
5. **Deploy → New deployment** → click ⚙️ next to "Select type" → **Web app**:
   - Description: `Website enrolments`
   - Execute as: **Me**
   - Who has access: **Anyone**
6. **Deploy → Authorize access**, then pick md.rahatislam.2427@gmail.com. If you see "Google hasn't verified this app": **Advanced → Go to … (unsafe) → Allow**. This is normal for your own script.
7. Copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`) and save it as **ENROLMENT URL**.

---

## Step 3: Certificates sheet → codes, emails, logins
In your **Certificates copy**:
1. **Extensions → Apps Script**, select all, delete.
2. Paste everything from `certificates-script.gs`.
3. Near the top, check this line and change it if your website address is different:
   `var SITE_URL = 'https://firstaidswedenbd.com/';`
   (for example `https://firstaid-website.vercel.app/`). The emails link here.
4. Click 💾 **Save**.
5. **Deploy → New deployment → ⚙️ → Web app**:
   - Description: `Certificates`
   - Execute as: **Me**
   - Who has access: **Anyone**
6. **Deploy** and allow permissions, including **"Send email as you"**, which is needed for the code emails.
7. Copy the **Web app URL** and save it as **CERTIFICATE URL**.
8. Go back to the sheet tab and **refresh**. A new menu **🎓 Certificates** appears after a few seconds.
9. Click **🎓 Certificates → Set up Certificates tab**. The header row turns blue.

---

## Step 4: Connect both to the website
1. Open your website with `#admin` at the end (e.g. `https://your-site.vercel.app/#admin`) and log in.
2. **Enquiry → Sheet endpoint**: paste the **ENROLMENT URL**.
3. **Certificate → Endpoint**: paste the **CERTIFICATE URL**.
4. Click **Download content.json**.
5. On **github.com**, open your website repository → **Add file → Upload files** → drop in the new `content.json` → **Commit changes**.
6. Wait about 1 minute, then refresh the website.

---

## Step 5: Test
**Enrolment:**
1. On the website, fill in **Save your spot** and send it.
2. A new row appears in your Enrolments sheet within seconds. Delete it afterwards.

**Certificate:**
1. In the Certificates sheet, add a row: *Full name*, *Organisation / group*, *Type* (Individual / Group / Organization), *Course*, *Training date*, *Trainer*, *Valid until*, and **your own email**. Leave the other columns empty.
2. Click **🎓 Certificates → Email codes to new rows**. A code appears and you get the email.
3. On the website, open **Certificate**, enter the code, choose an ID and password, and click **Claim my certificate**.
4. Click **Download PDF**, then scan the QR code with your phone. It should say **Valid certificate**.
5. Delete the test row.

---

## Day to day
| Task | How |
|---|---|
| See new enrolments | Open the Enrolments sheet. Rows appear automatically |
| Excel copy | In the sheet: **File → Download → Microsoft Excel (.xlsx)** |
| Issue certificates after a training | Add one row per person or organisation → **🎓 Certificates → Email codes to new rows** |
| Forgotten password | Clear that row's *Account ID*, *Password hash* and *Claimed at*. They claim again with the same code |
| Lost code | The code is in column A. Send it to them, or clear *Email sent* and run the email step again |
| Changed a script | **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The URL stays the same |

**Safety notes**
- Keep the **Certificates** sheet private.
- The **Enrolments** sheet is editable by anyone with its link. Anyone who has the link can also open its script. If anything looks wrong, change its sharing to **Viewer**.
