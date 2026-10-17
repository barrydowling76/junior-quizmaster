# Junior Quizmaster

A daily five-question kids' quiz hosted by Professor Quizzard. Children answer out loud; an answer only counts once they say "The answer is…". After the quiz they're offered a fun fact.

Live: https://barrydowling76.github.io/junior-quizmaster/

- Static site served by GitHub Pages: `index.html`, `app.js`, `content.js`, `audio/`, `icons/`.
- **Wizard voice:** every line is pre-recorded (open-source Kokoro TTS, "jolly old man" voice, deepened with a light room echo) in `audio/`. Lines are stitched together in the browser with Web Audio, with the child's name dropped in from `audio/n/`. If a clip ever fails to load, the app falls back to the phone's built-in voice.
- **Content:** 200 questions across four age groups (4–5, 6–7, 8–9, 10–12), five new each day per age group, no repeats for ten days; 50 fun facts; 376 children's names (Irish names spelled phonetically for the voice).
- **Voice in:** Web Speech API (Chrome on Android/desktop, Safari on iPhone/iPad).
- Test version: quizzers and scores are saved on the device only.
