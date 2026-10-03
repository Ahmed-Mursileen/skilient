---
name: Skilient
description: A university-gated record of student work that recruiters can check.
colors:
  ink: "#0E0D0B"
  vermillion: "#C03910"
  vermillion-hover: "#9E2E08"
  vermillion-subtle: "#FFF2EE"
  paper-page: "#F0EFED"
  paper-surface: "#FAF9F7"
  paper-elevated: "#FFFFFF"
  graphite: "#484744"
  graphite-muted: "#636260"
  rule: "#CECDCA"
  rule-strong: "#AEADA8"
  verified-teal: "#076C6A"
  verified-teal-subtle: "#E8F8F6"
  night-page: "#0A0A09"
  night-surface: "#131311"
  chalk: "#E7E7E3"
  vermillion-night: "#E04020"
typography:
  display:
    fontFamily: "Spectral, Georgia, serif"
    fontSize: "clamp(2.25rem, 1.1rem + 2.6vw, 2.75rem)"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "-0.022em"
  headline:
    fontFamily: "Spectral, Georgia, serif"
    fontSize: "40px"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Spectral, Georgia, serif"
    fontSize: "30px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  subtitle:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
  body-lg:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.65
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  code:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "13px"
    lineHeight: 1.55
rounded:
  sm: "3px"
  md: "6px"
  lg: "10px"
  xl: "16px"
  full: "9999px"
spacing:
  gutter: "clamp(1rem, 5vw, 2.5rem)"
  column-gap: "24px"
  section: "80px"
  section-dense: "64px"
components:
  button-primary:
    backgroundColor: "{colors.vermillion}"
    textColor: "{colors.paper-elevated}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 24px"
  button-primary-hover:
    backgroundColor: "{colors.vermillion-hover}"
  input:
    backgroundColor: "{colors.paper-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "48px"
  capture-frame:
    backgroundColor: "{colors.paper-page}"
    rounded: "{rounded.lg}"
  rules-band:
    backgroundColor: "{colors.vermillion}"
    textColor: "{colors.paper-elevated}"
    typography: "{typography.headline}"
---

# Design System: Skilient

## Overview

**Creative North Star: "The Record You Can Check"**

Skilient reads like a printed record: an attested document, a stamped result card, a notice board. Every claim on a page is either a real capture of the product, a sourced figure, or a rule we commit to, so the system is built from paper, ink and one vermillion stamp. Type does the heavy lifting: Spectral for the headline voice, Barlow for everything that has to be read quickly.

Density is calm and editorial on the public site (an 80 px section rhythm, 62ch measures) and compact in the product. Light and dark are designed as equals. Light is paper with ink; dark is a night ground with chalk text and a brighter vermillion. Art is two-colour risograph print (ink and vermillion on cream, halftone, slight misregistration), never photography, and never used for the product itself, which only ever appears as real captures.

**Key Characteristics:**
- Paper grounds, ink text, one vermillion accent for actions and the single full-bleed "Our rules" field.
- Teal appears only where verification appears.
- Spectral 500 for display, h1 and h2; Barlow from h3 down; JetBrains Mono only for codes and data.
- Hairline rules separate real content; no decorative grids, no eyebrows.
- Motion is feedback, plus one focal moment per page at most.

## Colors

A restrained paper-and-ink palette with one vermillion voice and a teal kept for proof.

### Primary
- **Stamp Vermillion** (#C03910): buttons, links, the focus ring, and the "Our rules" band. In dark mode it becomes #E04020, used for text only at 24 px and up; smaller links use the lighter tint.

### Neutral
- **Press Ink** (#0E0D0B): primary text in light mode, and the ground in dark mode (#0A0A09).
- **Page Paper** (#F0EFED) / **Surface Paper** (#FAF9F7) / **Sheet White** (#FFFFFF): page, raised bands and cards, elevated sheets and inputs.
- **Graphite** (#484744, muted #636260): secondary text and captions.
- **Hairline Rule** (#CECDCA, strong #AEADA8): borders and dividers.
- **Chalk** (#E7E7E3): primary text in dark mode.

### Tertiary
- **Verified Teal** (#076C6A, subtle #E8F8F6): verified marks, CV status and evidence badges only.

### Named Rules
**The One Stamp Rule.** Vermillion is the only accent. It marks actions and one drenched field per page, never decoration.

**The Proof Colour Rule.** Teal means "checked by Skilient". Never use it for anything that isn't verified.

**The Tier Colour Rule.** The six tier colours (Raw to Luminary) appear only on tier badges and the tier ladder.

## Typography

**Display Font:** Spectral (with Georgia)
**Body Font:** Barlow (with system-ui)
**Label/Mono Font:** JetBrains Mono, for codes and data only

**Character:** A bookish serif with a plain, slightly condensed sans: the voice of a printed record set beside a form you can fill in.

### Hierarchy
- **Display** (500, clamp 2.25 to 2.75 rem, 1.08): page headlines on the public site (`.text-hero`), sized so the landing headline sets in two lines at 1280 px.
- **Headline** (500, 40 px, 1.1): section headings on the public site (32 px on phones).
- **Title** (500, 30 px, 1.15): sub-sections and page titles in the product.
- **Subtitle** (Barlow 600, 22 px, 1.25): card and plan titles (h3).
- **Body large** (400, 18 px, 1.65): intros and long reads, at most 62ch.
- **Body** (400, 15 px, 1.6): everything else.
- **Label** (400, 13 px, 1.55): captions, sources and helper text.

### Named Rules
**The No Eyebrow Rule.** No small tracked labels above headings. A heading stands on its own.

**The No Em-Dash Rule.** Visible copy uses full stops, commas and colons.

## Layout

A 12-column grid, at most 1280 px wide, with gutters of `clamp(1rem, 5vw, 2.5rem)` and 24 px column gaps. Sections run on an 80 px rhythm (64 px on dense ones), with more space above a heading than below. Each landing section uses its own layout family (split, full-width media, ruler, bento, index rows, accordion, centred statement), and organisation pages compose the same parts in their own order. Below 768 px everything stacks to one column with 16 px gutters. Below 1024 px the nav collapses into a Popover menu, and Join stays in the bar.

## Elevation & Depth

Flat by default, with depth carried by tone: page paper, then surface paper, then a white sheet. Shadows are soft and ambient in light mode and switch off in dark mode, where the lighter surfaces carry the layering.

### Shadow Vocabulary
- **elevation-1** (`0 1px 2px rgb(14 13 11 / 0.05), 0 1px 3px rgb(14 13 11 / 0.04)`): cards at rest.
- **elevation-2** (`0 2px 6px rgb(14 13 11 / 0.06), 0 4px 14px rgb(14 13 11 / 0.06)`): popovers and menus.
- **elevation-4** (`0 8px 24px rgb(14 13 11 / 0.1), 0 20px 52px rgb(14 13 11 / 0.12)`): sheets and dialogs.

### Named Rules
**The Paper Stack Rule.** Separate layers with tone and a hairline first; reach for a shadow only for things that float (menus, sheets).

## Shapes

Radius 6 px for buttons and inputs, 10 px for capture frames, plan columns and sheets, and full rounding only for avatars and pills. Hairline borders (1 px) frame captures and cards. Definition items carry a 2 px ink rule on top instead of a box.

## Components

### Buttons
- **Primary:** vermillion, white text, 48 px tall on the public site, 6 px radius, Barlow 600. Hover darkens to #9E2E08, press scales to 0.98 over 120 ms, and an arrow inside nudges 4 px on hover.
- **Text link:** ink, underlined with a 4 px offset, Barlow 600, often with a trailing arrow.

### Inputs
- 48 px, white sheet, hairline border, 6 px radius, label above, helper or error text below and linked with `aria-describedby`.

### Capture frame
- A real product capture (AVIF/WebP, both themes, lazy) on page paper inside a hairline, 10 px frame. Never a div mock-up and never generated art.

### Plan table
- Plans as columns separated by a top rule, prices in Spectral, lines worded from each plan's grants. Monthly and yearly switch with a CSS radio pair, which works without JavaScript.

### Navigation
- 64 px bar: wordmark, audience links, Sign in, and a vermillion Join. Signed-in visitors see "Open Skilient" instead.

### Rules band (signature)
- The one full-bleed vermillion field on the landing page: four stacked Spectral lines in on-primary colour.

## Do's and Don'ts

### Do:
- **Do** show the product only as real captures in both themes, with alt text that says the content is a sample.
- **Do** read every price and limit from `plans` and `platform_config`; copy never repeats a number billing enforces.
- **Do** keep every page complete with JavaScript off. Motion only adds to a page that already works.
- **Do** honour reduced motion: the hero becomes a 200 ms crossfade, and everything else is instant.

### Don't:
- **Don't** use gradient blobs, stock photos, logo walls, emoji or icon tiles.
- **Don't** use teal or tier colours outside verification and tiers.
- **Don't** add section reveals, parallax or marquees.
- **Don't** use generated art for anything that depicts the product.
