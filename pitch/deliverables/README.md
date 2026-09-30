# Pitch film

`skilient-pitch-film-4k.mp4`: the 3:00 Skilient pitch film for the Bahria Startup Competition (first round). 3840×2160, H.264, 30 fps, silent (no audio track); three founders present over it live.

Who speaks when: `../cues.md`. Judge Q&A: `../qa.md`. Every number on screen and its source: `../claims.md`.

This is the sharing copy (encoded at CRF 21, 23.7 MB). The full-quality master is not committed; regenerate it with:

```bash
node pitch/render.mjs --full --dpr 2 --fps 30 --workers 4   # writes pitch/out/film.mp4 (about 17 minutes)
```

`pitch/out/` is gitignored (renders and contact sheets). Sample data in the film (the CV, "Ayesha Khan") is made up.
