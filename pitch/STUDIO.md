# Pitch studio rules

## Render contract
- Every film is a pure function of time: `window.seek(t)` paints frame t.
- No CSS transitions, setTimeout or requestAnimationFrame in render mode; no state carried between frames. Seeded noise only (mulberry32), never `Math.random`.
- `node pitch/render.mjs` renders PNG frames at 1920×1080 with deviceScaleFactor 2 (3840×2160), 30 fps; ffmpeg encodes H.264 yuv420p, CRF 16, no audio stream.

## Look
- Banned defaults: centered title on gradient, everything fading in, corner labels and frame borders, glow on UI chrome, generic particle bursts.
- One display face (Spectral), one UI face (Barlow), one accent (vermillion #C03910) on ink #0E0D0B and paper #F4EFE6. Mono only inside real UI captures.
- Slide pacing (v2, after feedback that v1 felt like a social clip): one idea per slide; hold every state at least 5 s on screen; one reveal at a time; 1.2 s eased transitions and 0.8 s crossfades between beats; no screen shake, wipes or speeding loops. Motion is only for revealing or clarifying.

## Sound
No sound. The file has no audio track.

## Accuracy
- Every number on screen has a `verified` row in `claims.md`.
- Unbuilt features are labelled "launching". No prices. No email addresses.

## Loop before showing anything
1. Render one frame per beat as a contact sheet and look at it.
2. Score 1–10: hook in first 2 s, readability at phone size, motion quality, variety, brand accuracy.
3. Fix the 3 worst problems. Repeat until every score is 8+.
4. Only then do the full render.
