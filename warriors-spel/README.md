# Warriors-spelet 🐾

Ett AI-berättat äventyrsspel i Warriors-världen (Erin Hunter), på svenska.
Claude berättar historien, Gemini (Nano Banana) målar varje scen — med spelarens
egen katt i huvudrollen, skapad från en beskrivning eller en egen teckning.

## Setup

1. Installera [Node.js](https://nodejs.org) (v18+)
2. I projektmappen:
   ```
   npm install
   cp .env.example .env
   ```
3. Fyll i `.env`:
   - `ANTHROPIC_API_KEY` — skapa på https://console.anthropic.com (kräver betalkonto, men en spelkväll kostar runt någon krona)
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
   ├─ POST /api/narrate      → Claude API   → scentext + 3 val + bildprompt (JSON)
   ├─ POST /api/character    → Gemini API   → karaktärsreferensbild
   └─ POST /api/scene-image  → Gemini API   → scenbild (referensbild + scenprompt)
```

Nyckeln till att katten ser likadan ut i alla scener: den godkända
**referensbilden** skickas med i varje scenbildsanrop. Spelaren kan dessutom
ladda upp egna teckningar mitt i spelet (kamplägret, en rivalkatt, ett byte) —
de vävs in i nästa scen, både i bilden och i berättelsen.

## Anpassa

- **Berättarens regler** (ton, ålder, story): `NARRATOR_SYSTEM` i `server.js`
- **Bildstilar**: `STYLES` i `server.js`
- **Modeller**: `CLAUDE_MODEL` / `IMAGE_MODEL` i `.env` — modellnamn ändras
  över tid, kolla https://docs.claude.com och https://ai.google.dev om något slutar funka
- **Utseende/texter**: allt i `public/index.html`

## Kostnad (ungefär)

- Claude-berättelsen: bråkdelar av ett öre per scen med Sonnet
- Gemini-bilder: gratisnivån täcker normalt spelande; betald nivå ~0,4 kr/bild

## Idéer för version 2

- Spara/ladda äventyr (skriv `state.history` + referensbilden till en JSON-fil)
- Galleri över alla genererade scener — bra att skriva ut!
- Flera katter (syskon spelar tillsammans, varsin referensbild)
- Ljud: bakgrundsatmosfär med skogssorl
