// Mock-test: ersätter global fetch för externa API:er, testar serverns alla endpoints
process.env.PORT = 3457;
process.env.ANTHROPIC_API_KEY = "mock";
process.env.GEMINI_API_KEY = "mock";

const realFetch = global.fetch;
const FAKE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
).toString("base64");

global.fetch = async (url, opts) => {
  if (String(url).includes("api.anthropic.com")) {
    const body = JSON.parse(opts.body);
    console.log("  → Claude mock anropad, history-längd:", body.messages.length, "| system:", !!body.system);
    return new Response(JSON.stringify({
      content: [{ type: "text", text: '```json\n{"scene":"Gryningen färgar Åskklanens läger rosa.","choices":["Gå på jakt","Träffa mentorn","Smyg till gränsen"],"imagePrompt":"a forest camp at dawn"}\n```' }],
    }), { status: 200 });
  }
  if (String(url).includes("generativelanguage.googleapis.com")) {
    const body = JSON.parse(opts.body);
    const parts = body.contents[0].parts;
    console.log("  → Gemini mock anropad, parts:", parts.map(p => p.inlineData ? "bild" : "text").join("+"));
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: FAKE_PNG } }] } }],
    }), { status: 200 });
  }
  return realFetch(url, opts);
};

require("./server.js");

const post = async (path, body) => {
  const r = await realFetch(`http://localhost:3457${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
};

setTimeout(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${name}`); };

  // 1. karaktär från textbeskrivning
  let r = await post("/api/character", { description: "silvergrå tabby", style: "bokomslag" });
  check("karaktär (text) returnerar bild", r.status === 200 && r.data.data === FAKE_PNG);

  // 2. karaktär från teckning + justering
  r = await post("/api/character", { drawingBase64: FAKE_PNG, drawingMime: "image/jpeg", style: "egen", adjustment: "mörkare ränder" });
  check("karaktär (teckning+justering) returnerar bild", r.status === 200 && r.data.mimeType === "image/png");

  // 3. berättelse (med markdown-staket i mocksvaret → testar JSON-rensning)
  r = await post("/api/narrate", { history: [{ role: "user", content: "Börja äventyret" }] });
  check("narrate parsar JSON ur ```-staket", r.status === 200 && r.data.choices?.length === 3 && !!r.data.imagePrompt);

  // 4. scenbild med referens
  r = await post("/api/scene-image", { referenceBase64: FAKE_PNG, referenceMime: "image/png", scenePrompt: "a forest camp at dawn", style: "bokomslag" });
  check("scenbild (referens) returnerar bild", r.status === 200 && r.data.data === FAKE_PNG);

  // 5. scenbild med referens + extra teckning (två bilder in)
  r = await post("/api/scene-image", { referenceBase64: FAKE_PNG, scenePrompt: "x", style: "akvarell", extraBase64: FAKE_PNG, extraMime: "image/jpeg" });
  check("scenbild (referens+teckning)", r.status === 200);

  // 6. felväg: Gemini svarar 500
  global.fetch = async (url, opts) => {
    if (String(url).includes("googleapis")) return new Response("boom", { status: 500 });
    return realFetch(url, opts);
  };
  r = await post("/api/scene-image", { referenceBase64: FAKE_PNG, scenePrompt: "x" });
  check("felväg: Gemini 500 → vårt fel-JSON", r.status === 500 && !!r.data.error);

  console.log(`\n${pass} godkända, ${fail} underkända`);
  process.exit(fail ? 1 : 0);
}, 600);
