// Warriors-spelet — lokal server
// Claude API: svensk berättarröst. Gemini API: bildgenerering (Nano Banana).
require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json({ limit: "25mb" })); // teckningar skickas som base64
app.use(express.static(path.join(__dirname, "public")));

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gemini-3.1-flash-image";

// ---------- Claude: berättaren ----------

const NARRATOR_SYSTEM = `Du är berättaren i ett interaktivt äventyrsspel baserat på bokserien Warriors (Erin Hunter), på svenska, för en läsare som är 10–12 år.

Spelaren är en ung kattkrigare. Använd seriens värld: klanerna (Åskklanen, Flodklanen, Vindklanen, Skuggklanen), Stjärnklanen, krigarlagen, lägret, jakten, gränspatruller, läkarkatter, lärlingar och mentorer.

Regler för berättandet:
- Skriv levande och stämningsfullt men åldersanpassat. Strider får vara spännande men aldrig blodiga eller grymma. Ingen död beskrivs i detalj.
- Varje scen: 80–150 ord. Avsluta aldrig scenen med en fråga — valen sköter det.
- Låt spelarens val få verkliga konsekvenser. Bygg en sammanhängande berättelse med en större story-båge (t.ex. ett mysterium, ett hot mot klanen, en profetia).
- Inkludera ibland kända inslag: Månstenen, samlingar vid Fyrträden, tecken från Stjärnklanen.
- Om spelaren skriver ett eget val (fritext), väv in det naturligt även om det är oväntat.
- Om spelaren har laddat upp en egen teckning beskrivs det föremålet/karaktären i scenen ("playerDrawingNote" i historiken).

Svara ALLTID med enbart ett JSON-objekt, ingen annan text, inga markdown-staket:
{
  "scene": "scentexten på svenska",
  "choices": ["val 1", "val 2", "val 3"],
  "imagePrompt": "an English prompt for an illustration of this exact scene, describing setting, lighting, mood and what the player's cat is doing. Do not describe the cat's appearance — a reference image is provided separately."
}`;

app.post("/api/narrate", async (req, res) => {
  try {
    const { history } = req.body; // [{role:"user"|"assistant", content:"..."}]
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1200,
        system: NARRATOR_SYSTEM,
        messages: history,
      }),
    });
    if (!r.ok) {
      const err = await r.text();
      console.error("Claude error:", err);
      return res.status(502).json({ error: "Berättaren svarar inte. Kontrollera ANTHROPIC_API_KEY." });
    }
    const data = await r.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const clean = text.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      // sista utväg: försök hitta JSON-objektet i texten
      const m = clean.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Kunde inte tolka berättarens svar");
      parsed = JSON.parse(m[0]);
    }
    res.json(parsed);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Något gick fel i berättelsen. Försök igen." });
  }
});

// ---------- Gemini: bilder ----------

async function geminiImage(parts) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_KEY },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    console.error("Gemini error:", err);
    throw new Error("gemini_failed");
  }
  const data = await r.json();
  const allParts = data.candidates?.[0]?.content?.parts || [];
  const img = allParts.find((p) => p.inlineData);
  if (!img) throw new Error("no_image_in_response");
  return { mimeType: img.inlineData.mimeType, data: img.inlineData.data };
}

const STYLES = {
  bokomslag: "in the style of a dramatic fantasy book cover illustration for the Warriors cat series, rich painted detail, cinematic lighting",
  akvarell: "as a soft, warm watercolor illustration with visible brush texture and gentle colors",
  realistisk: "as a semi-realistic digital painting of a real cat, natural fur detail, atmospheric light",
  egen: "keeping the artistic style of the original drawing, but cleaned up and polished as a finished illustration",
};

// Karaktärsblad: från beskrivning ELLER uppladdad teckning
app.post("/api/character", async (req, res) => {
  try {
    const { description, drawingBase64, drawingMime, style, adjustment } = req.body;
    const styleText = STYLES[style] || STYLES.bokomslag;
    const parts = [];
    let prompt;
    if (drawingBase64) {
      parts.push({ inlineData: { mimeType: drawingMime || "image/jpeg", data: drawingBase64 } });
      prompt = `This is a child's drawing of her warrior cat character. Create a character reference portrait of this exact cat ${styleText}. Keep every detail of the cat's colors, markings and features faithful to the drawing. Full-body portrait, standing proudly in a forest clearing, neutral pose, no text.`;
    } else {
      prompt = `Create a character reference portrait of a warrior cat with this appearance: ${description}. Render it ${styleText}. Full-body portrait, standing proudly in a forest clearing, neutral pose, no text.`;
    }
    if (adjustment) prompt += ` Adjustment requested: ${adjustment}.`;
    parts.push({ text: prompt });
    const img = await geminiImage(parts);
    res.json(img);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Kunde inte skapa katten. Kontrollera GEMINI_API_KEY och försök igen." });
  }
});

// Scenbild: referensbild + scenprompt (+ ev. extra teckning)
app.post("/api/scene-image", async (req, res) => {
  try {
    const { referenceBase64, referenceMime, scenePrompt, style, extraBase64, extraMime } = req.body;
    const styleText = STYLES[style] || STYLES.bokomslag;
    const parts = [
      { inlineData: { mimeType: referenceMime || "image/png", data: referenceBase64 } },
    ];
    let prompt = `The first image is the character reference for the player's warrior cat. Illustrate this scene featuring that exact cat (same colors, markings, features): ${scenePrompt}. Render it ${styleText}. Wide cinematic composition, no text or captions.`;
    if (extraBase64) {
      parts.push({ inlineData: { mimeType: extraMime || "image/jpeg", data: extraBase64 } });
      prompt += " The second image is the player's own drawing of something that appears in this scene — include it faithfully.";
    }
    parts.push({ text: prompt });
    const img = await geminiImage(parts);
    res.json(img);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Kunde inte måla scenen." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  🐾 Warriors-spelet körs på  http://localhost:${PORT}\n`);
  if (!ANTHROPIC_KEY) console.warn("  ⚠ ANTHROPIC_API_KEY saknas i .env");
  if (!GEMINI_KEY) console.warn("  ⚠ GEMINI_API_KEY saknas i .env");
});
