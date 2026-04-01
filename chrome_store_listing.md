# tack — Chrome Web Store Listing

---

## Name
tack

## Short Description (132 chars max)
Select images from any website and generate AI images that match their exact visual style.

*(89 chars — within limit)*

---

## Category
`Productivity` (primary) or `Photos`

---

## Long Description

tack turns your visual inspiration into AI-generated images — in seconds.

Browse Pinterest, design blogs, or anywhere on the web. Select the images whose style you love. Type what you want to create. tack analyzes the visual style of your selections and generates images that match it precisely.

**How it works:**
1. Open tack from your Chrome toolbar on any page
2. Select images whose style you want to capture
3. Type a subject (e.g. "a coffee mug", "a pair of sneakers")
4. Hit Generate — tack's AI analyzes the style and creates two original images in that aesthetic

**What makes tack different:**
tack doesn't just apply a filter. It uses Claude AI to read the visual language of your reference images — the rendering technique, color palette, texture, and mood — and translates that into a generation prompt for FLUX, one of the most capable AI image models available. The result is images that genuinely feel like they belong in the same visual world as your inspiration.

**Works everywhere:**
Select images from Pinterest boards, Behance, design portfolios, editorial sites — any page with images works.

**Your account:**
Sign up for a free account to save your generations and access them at tack.design. Free plan includes 3 generations. Pro plan available for unlimited monthly generations.

---

## Why tack needs access to all websites

tack's core function is to let users select reference images from any website they're browsing — not just a fixed set of domains. Whether you're on Pinterest, a design blog, an editorial site, or anywhere else on the web, tack needs to be able to scan the images on that page so you can select them as style references. The `scripting` permission is used solely to detect and collect image elements on the active tab. No data is collected from pages except the image URLs you explicitly select.

---

## Privacy Policy URL
https://tack.design/privacy

---

## Single Purpose Description
*(Required field in the Chrome Web Store — one sentence)*
tack lets users select images from any webpage and use them as style references to generate AI images that match that visual aesthetic.

---

## Screenshots (in order)
1. app_shots/store_ready/app_shot_1.png
2. app_shots/store_ready/app_shot_2.png
3. app_shots/store_ready/app_shot_3.png

---

## Developer Info
- Website: https://tack.design
- Email: patrick@tricksf.com

---

## Permissions Justification (for Google's review form)

**activeTab:** Used to get the URL of the current tab to determine page type (e.g. Pinterest vs. other sites) and to inject the image-scanning script only on the tab the user is actively viewing.

**scripting:** Used to scan the active page for images so the user can select them as style references. The injected function only reads image element attributes (src, width, height, alt) — it does not modify the page, collect user data, or run any remote code.

**storage:** Used to store the user's authentication token and generation count locally so they remain logged in between sessions.

**sidePanel:** Used to display the tack interface as a side panel within Chrome, allowing users to select images and generate without leaving the page they're browsing.

**Host permissions (<all_urls>):** tack's value is that it works on any website — users collect visual inspiration from Pinterest, design blogs, editorial sites, and countless other domains. Restricting to specific domains would break the core use case. The scripting injection only occurs when the user explicitly clicks the tack toolbar button and only reads image elements from the current active tab.
