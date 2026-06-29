# Tack Browser App Store Metadata

Use this as the copy/paste source for the App Store Connect submission. Fields marked `VERIFY` need a final decision or account-specific value before submission.

## App Information

**Name**

Tack Browser

**Subtitle**

Visual reference generator

**Primary Category**

Graphics & Design

**Secondary Category**

Productivity

**Bundle ID**

com.tack.browser

**SKU**

tack-browser-mac-001

## Version Information

**Version**

0.1.1

**Promotional Text**

Browse visual references, select the look you want, and generate product imagery from a clear creative direction.

**Description**

Tack Browser is a visual reference browser for creating product imagery.

Browse real websites, select images that define the look you want, describe the subject or scene, and generate new product imagery from that creative direction. Tack helps founders, designers, marketers, and creative teams move from scattered visual inspiration to usable image directions faster.

Use Tack Browser to:

- Browse visual sites and product pages in one focused workspace.
- Select reference images directly from the page.
- Capture visible regions when an image URL is not available.
- Generate new images from your selected visual direction.
- Save generations to your Tack library and organize them into boards.

Tack is built for creative workflows where taste, context, and speed matter.

**Keywords**

AI images,product photography,moodboard,visual references,creative workflow,design,marketing

**What's New in This Version**

Initial Mac release of Tack Browser, including web browsing, reference selection, image generation, saved generations, boards, and account sync.

**Support URL**

https://www.tack.design/contact

**Marketing URL**

https://www.tack.design

**Privacy Policy URL**

VERIFY: Use the production privacy policy URL. Recommended if live:

https://www.tack.design/privacy

**Copyright**

VERIFY exact legal owner. Suggested format:

2026 Tack AI LLC

## Review Information

**Sign-In Required**

Yes

**Demo Account**

VERIFY: Create a dedicated Apple review account with enough generation credits.

Username/email:

review@tack.design

Password:

VERIFY before submission

**Review Notes**

Tack Browser is a visual reference browser for generating product imagery.

To test:

1. Sign in with the demo account.
2. Open the Browse section.
3. Use a preset site such as Pinterest ideas, Behance, or Product site.
4. Select one or more reference images from the page.
5. Enter a short subject prompt, such as "ceramic coffee mug on a studio table."
6. Click Generate Images.
7. Open Library to confirm the generation is saved.
8. Create a board and save a generation to it.
9. Open Account to confirm plan, usage, and sync status.

Selected references and prompts are sent to Tack's generation backend to create new images. References are used for creative direction, composition, material, color, and style. The app includes safeguards intended to avoid copying identifiable people from reference images.

The app includes a browser so users can find visual references on the web. The browser is part of the core product experience.

## App Privacy

These answers should be verified against the production backend, analytics, and privacy policy before submission.

**Tracking**

Suggested answer: No, Tack Browser does not track users across apps or websites owned by other companies for advertising or data broker purposes.

**Data Linked to the User**

Suggested data types:

- Contact Info: Email Address
- User Content: Photos or Videos, Other User Content
- Identifiers: User ID
- Usage Data: Product Interaction
- Purchases: Purchase History, only if Stripe/subscription state is connected to the account and reflected in-app

**Data Not Linked to the User**

Suggested data types:

- Diagnostics: Crash Data, Performance Data, only if collected

**Data Use Purposes**

Suggested purposes:

- App Functionality
- Account Management
- Product Personalization, only if saved references/generations are used to personalize the user experience
- Analytics, only if analytics events are actually collected

**Sensitive Data**

Suggested answer: No, unless the production backend intentionally collects sensitive categories beyond user-provided prompts/images.

**Location, Contacts, Calendars, Health, Fitness, Financial Info**

Suggested answer: No.

## Age Rating

Most content-frequency answers should be `None`, assuming the app itself does not include violent, sexual, medical, gambling, or drug-related content.

Important: because Tack Browser can open arbitrary websites, the age-rating form likely needs:

**Unrestricted Web Access**

Yes

This may result in a higher age rating. It is still the safer answer for a browser-style app.

**User-Generated Content**

Suggested answer: No for social/user-to-user content, unless Tack includes public sharing or feeds. User prompts and private saved generations are user-created, but they are not currently a public social content system.

**Gambling and Contests**

No

## Export Compliance

VERIFY with legal/account owner before submission.

Suggested direction:

- The app uses standard HTTPS/TLS for network communication.
- The app uses Electron/macOS safe storage for local session protection.
- The app does not implement proprietary encryption for end users.

If App Store Connect asks whether the app uses encryption, answer based on Apple's wording. For typical HTTPS-only apps, this often falls under standard/exempt encryption, but the final certification should be made by the account holder.

## Pricing and Availability

VERIFY product decision.

Suggested launch setup:

- Price: Free
- Availability: United States first, or all storefronts if support/privacy/legal pages are ready globally
- In-app purchases: None in this binary unless Apple IAP has been implemented

If paid subscription upgrades happen on the website through Stripe, confirm this is acceptable for the app category and business model before review.

## Screenshot Plan

Mac screenshots should show the real product, not marketing slides.

Recommended set:

1. Browse workspace with a visual site loaded and selected references visible.
2. Generation panel with selected references and a clean prompt.
3. Saved generations Library grid.
4. Boards view or board organization.
5. Account page showing plan, usage, and sync.

Recommended captions, if using captioned screenshots outside App Store Connect:

- Browse visual references in context
- Select images that define the look
- Generate product imagery from direction
- Save generations to your library
- Organize creative work into boards

## Submission Blockers to Resolve

- Confirm privacy policy URL is live.
- Create a demo review account and confirm credentials.
- Decide copyright owner text.
- Decide launch territories and pricing.
- Confirm whether Stripe/subscription behavior is acceptable for this Mac App Store submission.
- Upload `dist-mas/Tack-Browser-0.1.1-mas.pkg` with Transporter.
- Run one final production account QA pass before clicking Submit for Review.
