# First Aid Centre of Sweden, Bangladesh: website

A static website with no build step. It's made of these files:

| File | What it is |
|---|---|
| `index.html` | The whole website: design, animations and the first-aid avatar scenes |
| `content.json` | **All the words, photos, numbers, links and colours.** This is the only file you change to update the site. |
| `admin.js` | The admin panel. It only loads when someone opens `yoursite.com/#admin`, so visitors never download it. |
| `README.md` | This guide |

---

## 1. Put the site online (GitHub + Vercel, one time only)

### A. Create a GitHub repository
1. Go to **github.com** and sign in (or create a free account).
2. Click the **+** at the top right, then **New repository**.
3. Name it, for example `firstaid-website`. Leave everything else as it is and click **Create repository**.
4. On the next page, click the link **uploading an existing file**.
5. Drag in `index.html`, `content.json`, `admin.js` and `README.md`.
6. Click the green **Commit changes** button.

### B. Connect Vercel
1. Go to **vercel.com** and click **Sign up**, then **Continue with GitHub**.
2. Click **Add New…**, then **Project**.
3. Find `firstaid-website` and click **Import**.
4. Don't change any settings (Framework: *Other*, no build command). Click **Deploy**.
5. After about a minute you get a link like `firstaid-website.vercel.app`. Your site is live.

From now on, every time a file changes on GitHub, Vercel updates the site automatically within about a minute.

### C. Use your own domain (e.g. firstaidswedenbd.com)
1. In Vercel, open your project, then **Settings**, then **Domains**.
2. Type `firstaidswedenbd.com` and click **Add**. Add `www.firstaidswedenbd.com` too.
3. Vercel shows one or two DNS records (usually an **A record** `76.76.21.21` and a **CNAME** `cname.vercel-dns.com`).
4. Log in where you bought the domain and open **DNS settings**. Add those records exactly, and remove any old A records for the same name.
5. Wait between 10 minutes and a few hours. Vercel shows a green tick when it works, and HTTPS is set up for you.

> ⚠️ **Before you switch the domain:** the photos currently load from the old site (`firstaidswedenbd.com/images/...`). Once the domain points to Vercel, those links stop working. Before switching, open the admin panel and re-upload the photos you want to keep (team, gallery, hero, AEDs, client logos). The admin panel compresses them automatically.

---

## 2. Edit the website (admin panel)

1. Open your site and add `#admin` to the end of the address, e.g. `https://firstaid-website.vercel.app/#admin`
2. **First time only:** choose an admin ID and password. Only a protected (salted, hashed) version is stored, and only in that browser.
3. Click a section on the left (Hero, Team, Gallery…) and edit. The live preview updates as you type.
4. Lists (team members, gallery albums, products…) have **Add**, **Delete**, **Move up/down** and drag-to-reorder.
5. **Photos:** click **Upload** or drop photos on the box. They're resized and compressed automatically. In **Gallery → Albums**, you can drop many training photos at once, create new categories, set a cover photo, and add a link, video or company logo.
6. Your work is saved automatically as a draft in this browser.

> **About the password (honest note):** the login stops casual visitors from opening the editor. But it lives in your browser, not on a server. **The real protection is that nothing changes on the live site until *you* upload the new `content.json` to *your* GitHub account.** Keep your GitHub password safe and turn on two-factor login on GitHub.

### Publish your changes
1. In the admin panel, click **Download content.json**.
   - If your file has *fewer* items than the live site (for example you deleted a gallery album by accident), you get a warning. You can **add the missing items back from the live site** before downloading.
   - The file size is shown. Many large photos make the site slower. Above about 5 MB you'll see a warning.
2. **On a computer:** go to github.com, open your repository, click **Add file**, then **Upload files**. Drop the new `content.json` in and click **Commit changes**.
3. **On a phone:** open github.com in your phone's browser and sign in. Tap the repository, tap **Add file** (if you don't see it, tap **⋯** or switch to *Desktop site* in your browser menu), then **Upload files**. Choose `content.json` from Downloads and tap **Commit changes**.
4. Wait about a minute and refresh the site. Done.
5. Keep the downloaded file somewhere safe. It's your backup. To roll back, upload an older `content.json` (or use **Import / restore** in the admin panel).

---

## 3. Enrolment form: answers arrive in Excel

The enrolment form on the website sends answers **straight into your existing Google Form** ("First Aid, CPR, BLS Training"). The fields are already connected.

**Get the answers as Excel:**
1. Open your form at **forms.google.com** and click the **Responses** tab.
2. Click **Link to Sheets** (the green icon), choose **Create a new spreadsheet**, then **Create**. Every new enrolment now appears as a new row, automatically.
3. Any time you want an Excel file: in that Google Sheet, click **File**, then **Download**, then **Microsoft Excel (.xlsx)**.
4. Optional: in the Responses tab, click **⋮** and **Get email notifications for new responses**.

**If you change the Google Form's questions**, update the website's field list in the admin panel (Enquiry → Google Form → Fields):
1. In Google Forms, click **⋮**, then **Get pre-filled link**. Type a dummy answer in every question and click **Get link**, then **Copy link**.
2. Paste the link somewhere. You'll see parts like `entry.103526039=...`. The number after `entry.` is that question's ID.
3. In the admin panel, put each ID in the matching field's **Entry** box.
4. Make sure the form is open to everyone: in Google Forms **Settings → Responses**, turn **off** "Restrict to users in your organisation" and "Collect email addresses: verified".

---

## 4. Change colours and fonts

- **Colours:** in the admin panel under **Brand → Colors** (primary blue, accent amber, ink, paper, emergency red). Changes show in the preview at once.
- **Fonts** (needs a small code edit): open `index.html` on GitHub (pencil icon ✏️) and find the line starting `<link href="https://fonts.googleapis.com/css2?family=...`. Change the font names there and in the line starting `--fd:` (headings) and `--fb:` (body text). Pick fonts at fonts.google.com.

---

## 5. Things to know

- **Videos** (YouTube, Vimeo or a direct .mp4 link) play inside the page in a full-screen player. Visitors never leave the site.
- **Contact buttons** (Call, WhatsApp, Email, Visit, and the green WhatsApp bubble) open a popup with a QR code plus an "open directly" button.
- **SOS button:** shows Bangladesh's national emergency number 999 and the first steps to take.
- **First Aid Lab:** animated avatars show CPR, AED, recovery position, choking, bleeding and burns, plus a CPR rhythm game. A disclaimer says it doesn't replace certified training.
- **Accessibility:** if a visitor's phone or computer is set to "reduce motion", heavy animations switch off automatically.
- **Social sharing preview** (the picture and text Facebook/WhatsApp show for a link) comes from the top of `index.html` (`og:` lines), because Facebook doesn't read `content.json`. Edit those lines on GitHub if you want to change them.
- **Backups of designs:** every time the design changes, the previous version is kept in the `backups/` folder.
