# Pitch films

Both are silent (no audio track), 3840×2160, H.264, 30 fps. Three founders present over them live.

| File | Length | Use |
| --- | --- | --- |
| `skilient-pitch-film-4k-v2.mp4` | 4:30 | **Main film.** Slide-paced: one idea per slide, calm crossfades, every state held for several seconds. About 90 s per presenter. |
| `skilient-pitch-film-4k.mp4` | 3:00 | Short fallback if the competition's time limit is 3 minutes. Faster-paced (v1). |

Who speaks when and the script for v2: `../cues.md` and `../script.md` (Roman Urdu + English). Judge Q&A: `../qa.md`. Every number on screen and its source: `../claims.md`.

These are sharing copies (CRF 22 and CRF 21). The full-quality masters are not committed; regenerate the v2 master with:

```bash
node pitch/render.mjs --full --dpr 2 --fps 30 --workers 4   # writes pitch/out/film.mp4, about 27 minutes
```

`pitch/out/` is gitignored (renders and contact sheets). Sample data in the films (the CV, "Ayesha Khan") is made up. The v1 3:00 script is in git history (`d2250c6`).
