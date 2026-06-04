# Deploy the Builder (this app) on the Lightsail box

Mounts this Next.js platform as a standalone service behind a subdomain of the
live box, alongside the tracker / AIKit / Nodes. The live AI-Legal tracker stays
separate — this app runs on its **own database** and (for now) its **own login**.

> **This app is heavy:** multi-GB `node_modules` + several GB of local AI models
> (bge-m3 embeddings, NLLB/opus-mt translation, Whisper/Piper audio) download on
> first run. **Resize the Lightsail instance first** — recommend **≥ 8 GB RAM and
> ≥ 80 GB SSD** (4 GB is the floor and will be tight during `next build` + model
> downloads). Lightsail resize = snapshot → create a larger instance from it →
> re-attach the static IP.

## 1. Postgres — its own database
```
sudo -u postgres psql -c "CREATE DATABASE grounded;"
sudo -u postgres psql -d grounded -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS vector;"
```
(Reuses the box's existing Postgres server; separate DB from the tracker's.)

## 2. Clone + configure
```
cd /home/ubuntu && git clone -b hub-tracker-nodes https://github.com/pauldevelopai/groundedai.git && cd groundedai
nano .env
```
Minimum `.env` (the Airtable/Drive/S3/Twilio vars are optional / post-pilot):
```
NODE_ENV=production
PORT=3006
DATABASE_URL=postgresql://<pguser>:<pgpass>@localhost:5432/grounded
JWT_SECRET=<random 32+ char string>
ANTHROPIC_API_KEY=<your key>
GROUNDED_LEAN=1   # LEAN deploy: keeps the 3 model-heavy agents (Archivist /
                  # Translator / Producer) as "coming soon" so the multi-GB local
                  # AI models never download. Remove this (and size up the box)
                  # to enable them later. Override the set with GROUNDED_COMING_SOON.
# Optional availability fallback if you run Ollama on the box:
# GROUNDED_OLLAMA_FALLBACK_URL=http://localhost:11434
# GROUNDED_OLLAMA_FALLBACK_MODEL=gemma3:12b
```

## 3. Install, migrate, seed, build
```
npm install                 # heavy — several minutes, multi-GB
npm run migrate             # applies db/migrations 001–043
npm run seed                # creates pilot newsrooms + admin@anchor.local / changeme123
npm run build               # next build (needs RAM; first AI-model fetch happens at runtime)
```

## 4. Run under pm2
```
pm2 start "npx next start -p 3006" --name grounded-studio
pm2 save
```

## 5. Caddy — its own subdomain
Add a site block to the Caddy config (e.g. `studio.developai.co.za`), then reload:
```
studio.developai.co.za {
    reverse_proxy localhost:3006
}
```
`sudo systemctl reload caddy` (or `restart` if `admin off`). Add a **DNS A-record**
for `studio.developai.co.za` → the box's static IP.

## 6. First sign-in
Visit `https://studio.developai.co.za`, sign in with `admin@anchor.local` /
`changeme123`, then **change the password immediately** (Team page). The Hub shows
Builder / Nodes / Tracker pillars; Builder (`/builder`, `/run`) + the 4 tools +
8 agents are live.

---

## Known follow-ups (post-first-deploy, in priority order)
1. **Single sign-on** — bridge the live tracker login to this app (mint this app's
   `anchor_token` on tracker login, or share a `.developai.co.za` cookie) so admins
   don't log in twice. Both use the same JWT pattern + `JWT_SECRET`.
2. **Hub Tracker card** — points at this app's own `/tracker` (now disabled); repoint
   it to the live `https://grounded.developai.co.za/legal`, or hide it.
3. **Trim duplicates** — this repo still contains a pre-split `tracker/` and `nodes/`;
   they're superseded by the live separate repos. Leave them dormant or remove.
4. **Cost logging** — route any of this app's tracker-side Claude calls through the
   shared `lib/claude.js` + `api_costs` (it's already Haiku-locked for the Builder).
5. **Link from the main menu** — add a "Studio"/"Builder" entry in `nodes/chrome.js`
   + the tracker nav pointing at the subdomain.
