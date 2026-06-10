# Warriors-spelet 🐾

Ett AI-berättat äventyrsspel i Warriors-världen (Erin Hunter), på svenska.
Gemini berättar historien och målar varje scen (Nano Banana) — med spelarens
egen katt i huvudrollen, skapad från en beskrivning eller en egen teckning.
Allt ryms i Geminis gratisnivå.

## Setup

1. Installera [Node.js](https://nodejs.org) (v18+)
2. I projektmappen:
   ```
   npm install
   cp .env.example .env
   ```
3. Fyll i `.env`:
   - `GEMINI_API_KEY` — skapa gratis på https://aistudio.google.com (gratisnivån räcker gott för spelande)
4. Starta:
   ```
   npm start
   ```
5. Öppna http://localhost:3000

## Så funkar det

```
Webbläsare (public/index.html)
   │  val, beskrivningar, teckningar (base64)
   ▼
server.js (Express)
   ├─ POST /api/narrate      → Gemini (text)  → scentext + 3 val + bildprompt (JSON)
   ├─ POST /api/character    → Gemini (bild)  → karaktärsreferensbild
   └─ POST /api/scene-image  → Gemini (bild)  → scenbild (referensbild + scenprompt)
```

### Två bildlägen

**`bank` (standard, gratis):** scenbilderna förgenereras i [Google AI Studio](https://aistudio.google.com)
via **Bildverkstan** (`/setup.html`) — en guidad promptlista där man skapar
kattporträttet och 16 scenbilder tillsammans, och sparar dem i `public/scenes/`.
Berättaren väljer sedan rätt bild per scen via en `imageTag`. Laddar spelaren
upp en teckning mitt i spelet visas teckningen själv som scenbild medan
berättaren väver in den i handlingen.

**`live` (kräver betalnivå hos Google):** varje scen målas unikt av bildmodellen.
Nyckeln till att katten ser likadan ut i alla scener: den godkända
**referensbilden** skickas med i varje scenbildsanrop, och egna teckningar
vävs in direkt i scenbilden. Aktiveras med `IMAGE_MODE=live` i `.env`.

## Anpassa

- **Berättarens regler** (ton, ålder, story): `NARRATOR_SYSTEM` i `server.js`
- **Bildstilar**: `STYLES` i `server.js`
- **Modeller**: `TEXT_MODEL` / `IMAGE_MODEL` i `.env` — modellnamn ändras
  över tid, kolla https://ai.google.dev om något slutar funka
- **Utseende/texter**: allt i `public/index.html`

## Kostnad (ungefär)

- Berättelsen: gratisnivån räcker gott (gemini-2.5-flash)
- Bilderna: gratisnivån täcker normalt spelande; betald nivå ~0,4 kr/bild

## Idéer för version 2

- Spara/ladda äventyr (skriv `state.history` + referensbilden till en JSON-fil)
- Galleri över alla genererade scener — bra att skriva ut!
- Flera katter (syskon spelar tillsammans, varsin referensbild)
- Ljud: bakgrundsatmosfär med skogssorl
