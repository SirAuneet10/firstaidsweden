# First Aid Centre of Sweden, Bangladesh: website brief

**What it is:** a single-page, animated website for the Bangladesh branch of Första Hjälpencentrum (Sweden, since 1989; Dhaka, since 2017). It presents first aid, CPR and AED training, sells the idea through interactive learning, and turns visitors into enrolments.

**Main goals:** build trust, teach the basics, collect training enrolments, and generate equipment enquiries.

**Tech:** static site with no build step. Files: `index.html` + `content.json` + `admin.js` + `parts/lab-scenes.js` + `images/`. Hosted on GitHub + Vercel, so updates go live about a minute after upload.

---

## Look and feel
- Brand colours from the logo: royal blue `#283090` and amber `#F8B040`, with deep navy, warm off-white and an emergency red.
- Fonts: Familjen Grotesk (a Swedish-made typeface) for headings, Inter for text, and Instrument Serif italics for accents.
- The six-heart logo is redrawn as a sharp vector and animated throughout.

## Sections, top to bottom
| # | Section | What visitors see / do |
|---|---|---|
| 1 | **Preloader** | Six hearts fly in and assemble the logo, a heartbeat line draws, then the screen splits open |
| 2 | **Emergency header** | A red "LIVE" strip scrolls first-aid tips and has a ringing **EMERGENCY 999** button. Below it, a **live patient-monitor** heartbeat strip whose BPM rises as visitors scroll faster and calms when they stop. The logo hearts beat with each pulse |
| 3 | **Hero** | 3 auto-playing slides, each with a different photo transition. Headlines reveal word by word, flowing heartbeat lines in the background react to the mouse, floating info chips and 3D tilt |
| 4 | **Organisations** | Two rows of full-colour client/partner logos (17) scrolling in opposite directions |
| 5 | **About** | Text that lights up word by word, an animated **Stockholm → Dhaka** route drawn as you scroll, a 1989–Today timeline, and an in-page video player |
| 6 | **Numbers** | Rolling counters: 37+ years (updates itself every year), 8 sectors, 30+ products, 2017 |
| 7 | **Training programmes** | 8 sector cards (Corporate, Industry, Defence, Embassies, Medical, Academic & Sports, Transport, General) that slide sideways as you scroll on desktop and swipe on phones |
| 8 | **Compliance band** | Giant scrolling words (CPR · AED · First Aid…) under the Bangladesh labour-law compliance message |
| 9 | **What you'll learn** | 5 colourful course cards that stack like playing cards as you scroll |
| 10 | **First aid in 4 steps** | 6 situations (CPR, AED, recovery position, choking, bleeding, burns). **Hover or tap a card and an animated first-aider acts out each step**, with the matching step highlighted live. "Full screen" opens a larger player |
| 11 | **Interactive First Aid Lab** | A larger animated avatar stage with tabs for all 6 scenarios and synced step lists, plus the **"Can you keep the CPR beat?" game**: tap at 100–120/min, a gauge and score show your accuracy, and an optional 110 bpm metronome helps |
| 12 | **Equipment** | Defibtech AED spotlight (Lifeline AED / VIEW / PRO switcher), 2 AI-illustrated banners, and 4 product categories with tilt-and-glare cards |
| 13 | **Gallery** | Albums grouped by category with filters, drag-to-scroll strips, a photo wall, and a full-screen viewer with swipe, thumbnails and in-page video. **Can be fed from Google Drive folders** |
| 14 | **Team** | 6 people. Hovering a name shows a floating photo (desktop); clicking opens their bio |
| 15 | **Enrol / Enquire** | A 3-step enrolment form connected to the company's **existing Google Form**, so answers land in Google Sheets and download as **Excel**. Call, WhatsApp, Email and Visit buttons each open a **QR-code popup** |
| 15b | **Claim certificate** | Trainees enter the unique code from their email, choose a login ID and password, then view their certificate and **download it as a PDF**. Includes a demo certificate, a QR code to check it's genuine (`#verify=CODE`), and multiple certificates per login. Codes and emails are sent from a private Google Sheet |
| 16 | **Find us** | Address, phones, email, hours, social links, and a Google Map that loads on request |
| 17 | **Footer** | Giant "FIRST AID" wordmark with hover animation, links and contact |

## Always available
- **SOS 999 button**: opens an emergency panel with a one-tap call and the first 5 steps to take.
- **WhatsApp button**: opens a chat with a pre-written message, or shows a QR code.
- **Full-page "lifeline"**: an amber heartbeat line drawn down the page as you scroll, spiking at each section (tablet and desktop).
- **Desktop extras**: custom cursor, glowing cursor trail, heart bursts on click, magnetic buttons.
- **Section transitions**: a blue curtain wipe with the logo when jumping between sections.

## Admin panel (`yoursite.com/#admin`)
- **Login:** ID + password, stored only as a salted PBKDF2 hash.
- **Editing:** edit **every** text, number, link, colour, image and SEO field, with a **live preview** (desktop / tablet / phone).
- **Lists:** add, delete with undo, reorder by drag or buttons, duplicate.
- **Images:** upload photos with automatic compression. Gallery albums take **many photos at once**, new categories can be added on the fly, and you can set the cover photo.
- **Google Drive:** paste a shared folder link per category. Subfolders become albums automatically, and new photos appear without republishing.
- **Enrolment form:** the fields linked to Google Forms can be edited.
- **Safety:** autosaved drafts, a warning before publishing a file with fewer items than the live site (with "add missing items back"), import/restore, and a file-size warning.
- **Publishing:** download `content.json` and upload it to GitHub (steps for computer and phone are built in).
- **Works on phones.**

## Built in by default
- **Fast:** images compressed to WebP (25 MB → 2.4 MB), lazy loading, and animations that pause when off-screen.
- **Respects "reduce motion" settings.**
- **Mobile-first:** tested at 360, 390, 768 and 1280+ px with no sideways scrolling.
- **SEO:** page title, description, social-share image, Google business info (structured data), and alt text.
- **Accessible:** keyboard focus states and screen-reader labels.
- **Honest content:** only real facts from the company. AI images and animations are labelled, and the lab carries a "not a substitute for certified training" note.
