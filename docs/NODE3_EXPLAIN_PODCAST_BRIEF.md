# Node 3 — Explain Newsroom Podcast Studio

This is the specific brief for **the third GROUNDED Node**. Read
`NEW_NODE_STARTER.md` in this same directory first for the
architecture. This file tells you what THIS Node does and what
makes it different from the existing two.

## One-sentence purpose

A laptop-based podcast generator for Explain newsroom: journalists
train their own voice from a short audio sample, then paste a
transcript and the app produces an AI-generated audio podcast in
their voice.

## Slug + display name

- **Slug**: `node-explain-podcast-studio` (drop the `explain-` if
  Paul wants this to be a generic newsroom podcast Node from the
  start — flag the question to him before deciding)
- **Display name in UI**: `Explain Podcast Studio`
- **Repo URL**: `github.com/pauldevelopai/node-explain-podcast-studio`

## Default newsroom

```js
newsroom: process.env.NEWSROOM || "Explain"
```

## What makes this Node structurally different

1. **ElevenLabs API as the core dependency.** No Anthropic or
   OpenAI needed for v1. The welcome screen asks ONLY for an
   ElevenLabs API key. Override `getSetupStatus` and `postSetup`
   in `lib/handlers.js` accordingly:

   - `getSetupStatus` returns `{ configured: hasElevenLabs,
     hasElevenLabsKey }`
   - `postSetup` accepts `{ apiKey }` (no provider field), validates
     it starts with the ElevenLabs key format, writes
     `ELEVENLABS_API_KEY` to `.env`, updates `process.env`.

2. **Multi-voice per install.** Unlike Capital FM and MakanDay
   which are single-user-focused, this Node supports multiple
   journalists at Explain each training their own voice. The data
   model needs a `voices` list, not a single voice.

3. **Audio uploads, bigger than the runtime default.** Voice
   training samples are typically 1–3 MB but can be larger.
   Override the upload limit in `createServer`:
   ```js
   createServer({
     slug, host, handlers, displayName, nodeVersion: pkg.version,
     uploadLimitMb: 50,    // up from default 25
   });
   ```

4. **Binary file outputs.** Generated podcasts are MP3 files,
   saved to `data/processed/podcasts/<voice-name>/<YYYY-MM-DD>-<title-slug>.mp3`.
   They DO NOT go to GitHub (set `.gitignore` to exclude
   `data/processed/podcasts/`). The newsroom keeps their podcasts
   on their laptop; only telemetry (the *fact* of generation,
   duration, char count, voice ID) leaves.

5. **Long-running operations.** Voice training takes 1–3 minutes;
   generation depends on transcript length. The frontend needs
   progress states (training… 30%… 60%… done) and the backend
   needs async-friendly handlers. Use ElevenLabs' webhook/polling
   pattern if their API supports it; otherwise just stream the
   audio as it generates.

## ElevenLabs choices

- **Use Instant Voice Cloning**, not Professional. Instant needs
  only 1–2 minutes of clean audio; Professional needs 30+ minutes
  and is much more expensive. Easier for newsrooms to onboard.
- **Use the `eleven_turbo_v2_5` model** unless a specific journalist
  needs higher quality (then use `eleven_multilingual_v2`). The
  turbo model is cheaper and fast enough for newsroom workflows.
- **Sample rate**: 44.1 kHz MP3. Good enough for podcast publishing,
  small enough to render quickly.

## The data model

In `data/processed/`:

- `node_explain_podcast_studio_meta.json` — boot beacon (runtime
  writes)
- `node_explain_podcast_studio_activity.json` — activity log (runtime
  writes via `host.log.run`)
- `node_explain_podcast_studio_errors.json` — error log (runtime
  writes via `host.log.error`)
- `node_explain_podcast_studio_feedback.json` — feedback log
  (runtime writes via the Feedback widget)
- `node_explain_podcast_studio_voices.json` — **Node-managed**.
  Array of voice entries. Each entry:
  ```json
  {
    "id": "<uuid generated locally>",
    "elevenlabs_voice_id": "<id returned by ElevenLabs after training>",
    "display_name": "Kerry-Anne Kuhn",
    "created": "2026-05-20T19:30:00.000Z",
    "samples_count": 1,
    "model": "eleven_turbo_v2_5"
  }
  ```
- `node_explain_podcast_studio_podcasts.json` — **Node-managed**.
  Array of podcast records. Each entry:
  ```json
  {
    "id": "<uuid>",
    "voice_id": "<local voice id>",
    "voice_name": "Kerry-Anne Kuhn",
    "title": "Episode 12 — The waste land",
    "transcript_chars": 4823,
    "duration_seconds": 612,
    "mp3_path": "data/processed/podcasts/kerry-anne-kuhn/2026-05-20-episode-12.mp3",
    "created": "2026-05-20T19:45:00.000Z"
  }
  ```

In `data/raw/`:

- `voice_samples/<voice-name>/` — uploaded audio used to train each
  voice. NOT committed (add to `.gitignore`); the newsroom keeps
  their source audio locally.

## The activity log — what to write

Use `host.log.run({})` for these ops. **Never** include transcript
text, voice sample content, or generated MP3 data — only metadata:

- `op: "voice_create_start"` — duration_ms not yet known
- `op: "voice_create_done", { voice_id, samples_count, training_seconds }`
- `op: "voice_create_failed", { reason_short }`
- `op: "podcast_generate_start", { voice_id, transcript_chars }`
- `op: "podcast_generate_done", { voice_id, transcript_chars, audio_seconds, generation_seconds }`
- `op: "podcast_generate_failed", { reason_short }`
- `op: "voice_delete", { voice_id }`

This is what Paul will see on the cohort dashboard — patterns of
use, where things fail, how heavily the Node gets used.

## The UI

Single mode, simpler than Capital FM's two-mode UI. Four tabs
under the header:

1. **Generate** (default) — pick a voice from a dropdown, paste
   transcript, optional title, click "Generate podcast". Progress
   bar appears, then a player + download link.
2. **Voices** — list of trained voices. "Train a new voice"
   button at the top: name + audio file upload. Each voice row
   has a delete button (with confirmation; can't be undone).
3. **History** — list of past podcasts with player, title,
   voice used, date, download link, delete button.
4. **Activity** — read-only view of the local activity log
   (same content the cohort dashboard sees).

Use a dark editorial palette like MakanDay rather than Capital
FM's light editorial — feels right for a media-production tool.
Pick a single accent colour DIFFERENT from terracotta (GROUNDED's
chrome). Suggested accent: a warm orange-pink (`#e8755a`) or a
cool slate (`#5a7da8`).

## The required handlers

In `lib/handlers.js`, export these custom handlers (none of which
auto-mount, so wire them manually from `index.js` by capturing
the app instance from `createServer`):

- `POST /api/voices` — multipart upload, `name` + `sample` file.
  Calls ElevenLabs add-voice endpoint, persists to voices.json,
  returns the new voice record.
- `GET /api/voices` — returns the voices.json array.
- `DELETE /api/voices/:id` — removes from voices.json, calls
  ElevenLabs delete-voice endpoint (best effort).
- `POST /api/podcasts` — body `{ voice_id, title, transcript }`.
  Calls ElevenLabs text-to-speech endpoint, streams audio to
  `data/processed/podcasts/...`, persists to podcasts.json,
  returns the new podcast record.
- `GET /api/podcasts` — returns the podcasts.json array.
- `DELETE /api/podcasts/:id` — removes from podcasts.json, deletes
  the MP3 file from disk.
- `GET /api/podcasts/:id/audio` — streams the MP3 back. Path
  validated against the podcasts.json record so URL injection
  can't reach arbitrary files.

The standard handlers (`getSetupStatus`, `postSetup`) ARE still
needed — exported normally so the runtime auto-mounts them.

## ElevenLabs API integration

Use the official `elevenlabs` Node package:

```
npm install elevenlabs
```

Initialise the client with the key from `process.env.ELEVENLABS_API_KEY`
inside each handler (not at module load — the welcome screen
sets the key at runtime, before the handlers run but after the
module is imported).

Example shape (Claude Code: write this properly, this is just
sketching the structure):

```js
import { ElevenLabsClient } from "elevenlabs";

async function generatePodcast(voiceId, transcript) {
  const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  const audioStream = await client.textToSpeech.convert(voiceId, {
    text: transcript,
    model_id: "eleven_turbo_v2_5",
    output_format: "mp3_44100_128",
  });
  // pipe audioStream to a file …
}
```

## Privacy callouts in the README

Specific to this Node, add to the "What you share with Develop AI"
section:

**Stays on the laptop (never uploaded):**
- The trained voices' audio samples
- The transcripts you paste in
- The generated MP3 podcast files
- Your ElevenLabs API key

**Committed to your fork (visible to Paul):**
- All four standard telemetry files
- The voices.json file — voice display names, dates trained, sample
  counts. ElevenLabs voice IDs (which mean nothing to anyone
  without ElevenLabs API access).
- The podcasts.json file — episode titles, dates, char counts,
  audio duration in seconds. NOT the transcripts, NOT the audio.

Note in the README: "Voice training and podcast generation use
ElevenLabs' API. ElevenLabs sees the audio samples (during voice
training) and the transcripts (during generation). They have
their own privacy terms — Explain's team should read them before
training voices."

## Dependency

```json
"dependencies": {
  "@developai/grounded-node-runtime": "github:pauldevelopai/grounded-node-runtime#main",
  "dotenv": "^16.4.5",
  "elevenlabs": "^0.27.0"
}
```

## v1 scope — what's IN

- Train a voice from a single audio sample
- Generate a podcast from a transcript using a chosen voice
- List voices, delete voices
- List podcasts, play in-browser, download, delete
- Welcome screen for ElevenLabs API key
- Feedback widget (free via runtime)
- Activity log + cohort dashboard visibility

## v1 scope — what's OUT (defer to v2)

- AI-assisted transcript editing (would need Anthropic/OpenAI)
- Title generation from transcript
- Episode notes / chapter markers
- Multi-language voice cloning
- Voice fine-tuning beyond Instant
- Direct publishing to Spotify/Apple Podcasts
- Background music or sound design
- Webhook-driven generation (poll instead)

Resist scope creep on v1. Ship the simplest useful thing.

## What to ask Paul before building

If Claude Code reads this brief and finds anything unclear, ask
Paul these in priority order:

1. **Slug confirmation**: `node-explain-podcast-studio` or
   `node-podcast-studio` (more generic)?
2. **Accent colour** for the UI — any preference?
3. **Anything about Explain newsroom Paul wants surfaced in the
   README** (location, focus areas, anyone specific at Explain
   who'll be the primary contact)?
4. **ElevenLabs plan Explain is on** — affects which voice models
   are available. Free tier limits voice cloning quite tightly.

Don't ask procedural questions ("should I make this a JavaScript
file?") — read the starter pack, follow the conventions, ask only
about things genuinely undetermined.

## First-run checklist

After Claude Code builds the Node, before Paul ships to Explain:

- [ ] `npm install` completes cleanly
- [ ] `npm start` boots and serves on port 3000
- [ ] `localhost:3000` shows the welcome screen
- [ ] Pasting an ElevenLabs key reveals the dashboard
- [ ] Terracotta GROUNDED bar visible at top
- [ ] Feedback button visible bottom-right above footer
- [ ] Train a test voice with a short sample audio file —
  voice appears in the Voices tab
- [ ] Paste a short transcript, pick the voice, click Generate —
  audio plays back in the History tab
- [ ] `data/processed/node_explain_podcast_studio_meta.json` exists
- [ ] After several runs, the activity log shows
  voice_create_done and podcast_generate_done entries
- [ ] Push to GitHub
- [ ] Add to `grounded/docs/nodes/registry.yaml`
- [ ] Re-run harvest from `grounded/`
- [ ] Cohort dashboard shows the new install in the Installs panel

Once all of that's true, the Node is ready for Explain's onboarding
call.
