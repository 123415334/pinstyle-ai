# tack — Chrome Web Store Listing

---

## Name
tack

## Short Description (132 chars max)
Select references from visual inspiration sites and generate new images in the same style.

*(84 chars — within limit)*

---

## Category
`Productivity` (primary) or `Photos`

---

## Long Description

tack turns visual references from your favorite visual inspiration sites into new images with the same aesthetic.

Open tack on a visual inspiration site. Select the references whose style you want to borrow. Type what you want to make. tack analyzes the shared look of your selections and generates original images in that same visual family.

**How it works:**
1. Open tack from your Chrome toolbar on a visual inspiration site
2. Select images whose style you want to capture
3. Type a subject (e.g. "a coffee mug", "a pair of sneakers")
4. Hit Generate and tack creates original images in that aesthetic

**What makes tack different:**
tack does more than apply a filter. It reads the shared visual language of your references, including composition, palette, rendering style, and mood, then uses that analysis to generate something new that still feels stylistically coherent.

**Where it works:**
tack is designed for visual inspiration sites across the web, including tack.design, inspiration boards, portfolios, marketplaces, image searches, and other standard webpages with selectable images. Some sites may block scanning or hide images in ways Chrome extensions cannot access.

**What gets sent:**
When you generate, tack sends only the image URLs you select and the prompt you type so it can analyze style and create results. It does not send the rest of the page for generation.

**Your account:**
Sign up for a free account and future results save automatically to your tack account at tack.design. Free includes 3 generations per month. Pro includes 120 generations per month. Studio includes 600 generations per month.

---

## Why tack needs supported-site and page access

tack's core function is to let users select reference images from the page they are actively viewing. tack requests page access for regular websites so it can scan visible image elements when the user opens tack. It only sends the image URLs the user selects plus the prompt they type in order to generate results.

---

## Privacy Policy URL
https://tack.design/privacy

---

## Single Purpose Description
*(Required field in the Chrome Web Store — one sentence)*
tack lets users select images from the current page and use them as style references to generate new AI images in the same aesthetic.

---

## Screenshots (in order)
1. ../release-assets/store-screenshots/chrome/final/app_shot_1.png
2. ../release-assets/store-screenshots/chrome/final/app_shot_2.png
3. ../release-assets/store-screenshots/chrome/final/app_shot_3.png

---

## Developer Info
- Website: https://tack.design
- Email: hello@tack.design

---

## Permissions Justification (for Google's review form)

**activeTab:** Used to access only the tab the user is actively viewing when they open tack, so the extension can scan that page for selectable reference images.

**scripting:** Used to scan the active page for images so the user can select them as style references. The injected function only reads image element attributes (src, width, height, alt) and page-embedded Pinterest image data. It does not run remote code.

**storage:** Used to keep the user signed in, remember plan and usage state, and preserve local workspace/history state between sessions.

**sidePanel:** Used to display the tack interface as a side panel within Chrome, allowing users to select images and generate without leaving the page they're browsing.

**downloads:** Used only when the user chooses to download a generated image.

**identity:** Used only for optional Google sign-in through Supabase authentication.

**Host permissions:** tack needs access to regular websites so it can scan the page the user is actively viewing for selectable reference images. Generation uses only the references the user selects plus the prompt they type.
