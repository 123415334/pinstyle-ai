# tack — Chrome Web Store Listing

---

## Name
tack

## Short Description (132 chars max)
Select reference images on supported sites and generate new AI images in the same visual style.

*(89 chars — within limit)*

---

## Category
`Productivity` (primary) or `Photos`

---

## Long Description

tack turns visual references from supported sites into new images with the same aesthetic.

Open tack on a supported site with images. Select the references whose style you want to borrow. Type what you want to make. tack analyzes the shared look of your selections and generates original images in that same visual family.

**How it works:**
1. Open tack from your Chrome toolbar on a supported site
2. Select images whose style you want to capture
3. Type a subject (e.g. "a coffee mug", "a pair of sneakers")
4. Hit Generate and tack creates original images in that aesthetic

**What makes tack different:**
tack does more than apply a filter. It reads the shared visual language of your references, including composition, palette, rendering style, and mood, then uses that analysis to generate something new that still feels stylistically coherent.

**Currently supported:**
tack includes direct support for tack.design, Pinterest, Instagram, Behance, and Dribbble. It may also work on other regular image-based pages when the user opens tack on the current tab.

**What gets sent:**
When you generate, tack sends only the image URLs you select and the prompt you type so it can analyze style and create results. It does not send the rest of the page for generation.

**Your account:**
Sign up for a free account to save your generations and access them at tack.design. Free includes 3 generations. Pro includes 120 generations per month. Unlimited removes the cap.

---

## Why tack needs supported-site and page access

tack's core function is to let users select reference images from the page they are actively viewing. tack has direct host permissions for tack.design, Pinterest, Instagram, Behance, and Dribbble so it can reliably scan those supported sites. It also uses activeTab so it can read images on the current tab after the user explicitly opens tack. It only sends the image URLs the user selects plus the prompt they type in order to generate results.

---

## Privacy Policy URL
https://tack.design/privacy

---

## Single Purpose Description
*(Required field in the Chrome Web Store — one sentence)*
tack lets users select images from supported sites and use them as style references to generate new AI images in the same aesthetic.

---

## Screenshots (in order)
1. app_shots/store_ready/app_shot_1.png
2. app_shots/store_ready/app_shot_2.png
3. app_shots/store_ready/app_shot_3.png

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

**Host permissions:** tack has direct support for tack.design, Pinterest, Instagram, Behance, and Dribbble so it can reliably scan reference images on those supported sites. It also uses activeTab to scan the current tab after the user opens tack. Generation uses only the references the user selects plus the prompt they type.
