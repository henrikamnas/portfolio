# Privat Google Foto-klon — Implementeringsplan

> Mål: synka bilder/video automatiskt från telefonen till "molnet", privat, så billigt som möjligt. Datamängd: 1–4 TB.

---

## 1. Beslut: bygga från scratch vs deploya Immich

**Rekommendation: deploya [Immich](https://immich.app).** Att bygga en riktig Google Foto-klon från scratch betyder native iOS- och Android-appar med pålitlig bakgrundsuppladdning, server med dedup/transkodning/EXIF, galleri-UI, ansiktsigenkänning och semantisk sökning. Det är månader av arbete — och resultatet blir i bästa fall en sämre Immich.

Immich är open source (AGPL), gör *exakt* det du beskriver, och blev stabil (v2.0) i oktober 2025 med semver och åtagande om bakåtkompatibilitet. Du äger all data själv. Vi "bygger" alltså genom att sätta upp, härda och drifta Immich — inte genom att skriva en egen app.

---

## 2. Hur Immich fungerar (detaljerat)

### Komponenter (körs som Docker-containrar)

| Container | Roll |
|---|---|
| `immich-server` | REST-API + webbgränssnitt (SvelteKit) **och** bakgrundsjobben (köhantering, miniatyrer, EXIF, transkodning). I v2 är API och "microservices" samma image. |
| `immich-machine-learning` | ONNX-modeller för CLIP (semantisk sökning, "strand solnedgång") och ansiktsigenkänning. **Valfri** — kan stängas av för att spara RAM. |
| `database` (PostgreSQL + vektor-extension) | All metadata: användare, album, EXIF, och vektor-embeddings för sökning. **Bilderna ligger INTE i databasen.** |
| `redis`/`valkey` | Jobbkö och cache. |

**Filerna** (original, miniatyrer, transkodad video) ligger på filsystemet i en library-mapp — inte i databasen. Det gör backup enkelt: du säkerhetskopierar (a) library-mappen och (b) en pg_dump av databasen.

### Uppladdnings-/backupflöde

1. Mobilappen (Flutter, native iOS + Android) laddar upp **originalfilen** till servern.
2. Servern beräknar en hash → **deduplicering** (samma bild laddas aldrig upp två gånger).
3. Bakgrundsjobb extraherar EXIF, genererar miniatyrer, transkodar ev. video, och (om ML är på) kör ansikts- och CLIP-jobb.
4. Allt dyker upp i tidslinjen i appen och webben.

### Mobil bakgrundsbackup — ärligt om begränsningar

- **Android:** riktig bakgrundsuppladdning via en background worker. Fungerar i praktiken som Google Foto — du behöver inte öppna appen.
- **iOS:** Apple begränsar äkta bakgrundsuppladdning hårt. Immich använder background-fetch/processing men det är "best effort". Pålitlig backup sker när appen är i förgrunden. I praktiken: öppna appen då och då, eller låt den ligga öppen på laddning över natten.
- Inställbart: vilka album som backas upp, endast Wi-Fi, original vs komprimerat, foreground/background.

### Funktioner du får

Automatisk backup, tidslinje, album, delade album, kartvy, ansiktsigenkänning, naturlig sökning, dubblettdetektering, papperskorg, flera användare (familj), partner-sharing. I praktiken Google Foto feature-för-feature, fast på hårdvara du äger.

### Vad drift kräver av dig

Docker Compose-stack, en `.env` med hemligheter, periodiska uppdateringar (`docker compose pull && up -d`), och — viktigast — en **backup-strategi** (se §5). Resurser: min 4 GB RAM (ML av), rekommenderat **8 GB RAM, 4 kärnor** (ML på). Databasen vill ha snabb lokal disk.

---

## 3. Hosting — rekommendation och kostnad (för 1–4 TB)

Den dyra delen är **lagringen**, inte beräkningen. 1–4 TB i molnet kostar pengar varje månad för alltid; hemma är det en engångskostnad.

### Kostnadsjämförelse (~4 TB, ungefärligt, EUR/mån)

| Alternativ | Engång | Per månad | Kommentar |
|---|---|---|---|
| **Hemma: mini-PC (N100, 16 GB) + 4 TB disk** | ~150–350 € | ~2–3 € el + ~13 € off-site backup | Billigast över tid, full LAN-hastighet, skalar billigt |
| Hemma: Raspberry Pi 5 (8 GB) + 4 TB USB-disk | ~200–350 € | ~1–2 € el + backup | Lägre effekt, men ML/transkodning långsammare |
| Hyrd: Hetzner VPS (CPX31, 8 GB) + Storage Box 5 TB | 0 € | ~15 € + ~13 € = **~28 €/mån** | Ingen hårdvara, åtkomst överallt; ~340 €/år |
| Hyrd billig: Hetzner CX22 (ML av) + Storage Box 5 TB | 0 € | ~5 € + ~13 € = **~18 €/mån** | Ingen ansiktsigenkänning/AI-sök |

> Hetzner höjde priserna 1 april 2026 — siffrorna ovan är ungefärliga.

### Min rekommendation

**Hemma-server (mini-PC med Intel N100/N305, 16 GB RAM) + extern SSD/HDD, åtkomst via [Tailscale], off-site backup till Hetzner Storage Box.**

Varför:
- **Billigast för 1–4 TB.** Att lagra flera TB i molnet kostar ~15–25 €/mån i evighet; hemma är disken en engångskostnad.
- **"Molnet" du ville ha** = en server du når från var som helst. Tailscale ger exakt det utan att exponera något publikt.
- **Säkrast & enklast nätverk:** ingen port-forwarding, ingen publik IP, inget attackytor mot internet. Telefonen och servern är på samma privata Tailscale-nät.
- En N100-burk klarar ML (ansikten/sök) och video-transkodning, vilket en Pi gör trögt.

**Alternativ utan hårdvara:** allt-i-molnet på Hetzner (VPS + Storage Box). Samma Docker-stack — bara hosting-lagret byts. Välj detta om du absolut inte vill ha en burk hemma.

[Tailscale]: https://tailscale.com

---

## 4. Migrering från Google Photos

- Begär export via **Google Takeout** (kan bli tiotals GB; dela upp i hanterbara arkiv).
- Importera med **[`immich-go`](https://github.com/simulot/immich-go)** — verktyget som matchar Takeouts JSON-sidecars mot rätt bild och bevarar datum/album/geodata (vanlig fallgrop om man bara drar in filerna rått).
- Verifiera antal och stickprov, behåll Google-kopian tills du litar på resultatet.

---

## 5. Backup-strategi (3-2-1) — hoppa inte över detta

Immich-servern är **inte** en backup; det är ditt primära bibliotek. Regel: 3 kopior, 2 medier, 1 off-site.

1. **Primärt:** Immich library-disken hemma.
2. **Lokal kopia:** andra disk / NAS hemma (t.ex. nattlig `restic`/`rsync`).
3. **Off-site:** krypterad `restic`- eller `rclone`-backup av (a) library-mappen och (b) nattlig `pg_dump` av databasen → **Hetzner Storage Box** (~13 €/mån) eller annan billig lagring.

Testa en återställning innan du raderar Google-kopian.

---

## 6. Implementeringsplan (faser)

### Fas 0 — Beslut & inköp
- Bekräfta hosting (hemma vs moln). Vid hemma: köp mini-PC + disk.
- Skaffa konton: Tailscale (gratis), ev. Hetzner Storage Box.

### Fas 1 — Grund
- Installera OS (Debian/Ubuntu), Docker + Docker Compose.
- Sätt upp Tailscale på servern (och på telefonen/laptop).
- Anslut och formatera datadisken; bestäm sökväg för `UPLOAD_LOCATION`.

### Fas 2 — Immich igång
- Hämta officiell `docker-compose.yml` + `.env` från Immich.
- Sätt `UPLOAD_LOCATION`, `DB_PASSWORD`, tidszon; behåll ML på.
- `docker compose up -d`, skapa adminkonto i webben, skapa din användare.

### Fas 3 — Mobil
- Installera Immich-appen (iOS/Android), peka på serverns Tailscale-adress.
- Aktivera auto-backup (välj album, Wi-Fi-only, original).
- Verifiera att nya foton dyker upp; testa iOS-bakgrundsbeteende.

### Fas 4 — HTTPS & åtkomst
- Tailscale räcker för privat åtkomst. Vill du ha snyggt domännamn/HTTPS: Tailscale Serve eller en reverse proxy (Caddy) med Let's Encrypt — **utan** att öppna publikt om det inte behövs.

### Fas 5 — Migrering
- Kör Google Takeout-import med `immich-go`. Verifiera datum/album/geo.

### Fas 6 — Backup
- Sätt upp `restic`/`rclone` till Storage Box (library + nattlig `pg_dump`).
- Schemalägg (cron/systemd-timer). **Gör och verifiera en teståterställning.**

### Fas 7 — Drift
- Aktivera Immichs schemalagda jobb (miniatyrer, ML).
- Rutin för uppdatering: `docker compose pull && docker compose up -d` (läs release notes vid major-versioner).
- Övervaka diskutrymme; planera disk-uppgradering när du närmar dig taket.

---

## 7. Säkerhet

- **Exponera inte Immich publikt** om det går att undvika — använd Tailscale.
- Starka lösenord/`.env`-hemligheter, ej i git.
- Off-site backup **krypterad** (restic gör detta).
- Håll Docker-images uppdaterade.

---

## 8. Öppna beslut

1. **Hosting:** hemma-server (rek.) eller allt-i-molnet på Hetzner?
2. **Hårdvara** (om hemma): mini-PC N100 (rek.) eller Raspberry Pi 5?
3. **Off-site backup-mål:** Hetzner Storage Box eller annat?

När dessa är spikade kan nästa steg vara att jag genererar färdig `docker-compose.yml` + `.env`-mall, Tailscale-setup och backup-skript.

---

## Appendix A — Billigaste molnlagring (object storage)

Alla tjänster nedan talar **S3-API:t**, så koden/verktygen blir desamma oavsett leverantör. Nyckeln: för en app du *bläddrar i* spelar **egress** (nedladdningstrafik) lika stor roll som lagringspriset. Ultrabilliga arkivtjänster är en fälla för aktiv användning.

| Tjänst | Lagring / TB / mån | Egress | ~4 TB / mån | Bäst för |
|---|---|---|---|---|
| **iDrive e2** | ~$4 | gratis upp till 3× lagrat | **~$16** | Billigaste aktiva lagring |
| **Hetzner Object Storage** | €4,99 | 1 TB/TB inkluderat | **~€20** | EU, redan i bilden |
| Backblaze B2 | $6 | gratis via Cloudflare | ~$24 | Mogen, "free egress"-trick |
| Cloudflare R2 | $15 | **noll** egress | ~$60 | Inga överraskningar, dyr lagring |
| Wasabi | $6,99 | gratis 1:1 (min 1 TB/90 dgr) | ~$28 | — |
| AWS Glacier Deep Archive | **~$1** | dyrt + ~12 h hämtning | ~$4 | **Endast** kall katastrof-backup |

**Rekommendation:**
- **App du bläddrar i:** iDrive e2 (billigast) eller Hetzner Object Storage (EU, förutsägbart). ~€16–24/mån för 4 TB.
- **Ren off-site backup (sällan läst):** Glacier Deep Archive ~$1/TB — men räkna med hämtningsavgift och timmars väntan vid återställning.

> Jämfört med hemma-servern i §3: 4 TB i molnet ≈ €16–24/mån ≈ €200–290/år *för alltid*. En disk hemma är en engångskostnad. Molnlagring vinner på noll hårdvara och off-site-säkerhet på köpet.

## Appendix B — Bygga egen uppladdarapp mot object storage

Detta är "bygg från scratch"-vägen. Fullt görbart, men var medveten: en *uppladdare* är ett par helger; en *tittare/galleri* ovanpå drar dig tillbaka mot att återimplementera Immich.

### Arkitektur

```
[Telefon-app]  --presigned PUT-->  [S3-bucket (Hetzner/B2/iDrive/R2)]
      |
      +--be om presigned URL-->  [Liten backend / serverless funktion]
                                  (håller hemliga nycklar, mintar URL:er)
```

1. **Lagring:** en S3-kompatibel bucket hos valfri leverantör ovan.
2. **Hemligheter — aldrig master-nyckeln i appen.** Två mönster:
   - **(rek.) Presigned URLs:** en liten backend (Cloudflare Worker / serverless / mini-VPS) tar emot "jag vill ladda upp fil X", verifierar dig och returnerar en tidsbegränsad presigned PUT-URL. Appen laddar upp **direkt** till bucketen. Nycklarna lämnar aldrig servern.
   - **Scoped application key:** t.ex. B2-nyckel låst till en bucket, inbäddad i appen. Enklare men svagare; gå med presigned om du kan.
3. **Mobilapp** — välj cross-platform (**Flutter** eller **React Native**) eller native (Kotlin/Swift). Ansvar:
   - Läsa kamerarullen (foto-behörighet).
   - Lokal **SQLite** över vad som laddats upp (per innehålls-**hash**) → dedup + återupptagning.
   - Per fil: hasha → be om presigned URL → ladda upp (**multipart/resumable** för stora videor) → markera klar.
   - **Bakgrundskörning:** Android **WorkManager** (pålitlig periodisk uppladdning); iOS **BGProcessingTask** (best effort, samma Apple-begränsning som Immich).
   - Hantera **HEIC/HEVC**, stora videor, återförsök, endast-Wi-Fi, batteri.
4. **Index/metadata:** för att kunna hitta/visa bilder senare behövs ett index (filnamn, datum, EXIF, hash) — antingen en manifest-fil i bucketen eller en liten DB. Detta är vad som gör att du senare behöver en **tittare** (web/app), och då närmar du dig Immichs omfång.
5. **Visning:** presigned GET-URL:er eller en enkel webbfrontend.

### Enklaste vägen om målet är "bilder i molnet", inte att koda

Du behöver inte skriva en app alls för att uppnå uppladdningen:
- **rclone** kan synka en mapp/kamerarulle till valfri S3-bucket (skript/schemalagt).
- Färdiga auto-upload-appar (t.ex. **PhotoSync**, eller **Autosync/FolderSync** på Android) laddar upp kamerarullen till S3-kompatibel lagring — noll kod, fungerar idag.

Bygg egen app främst om själva byggandet/lärandet är poängen, eller om du vill ha specifik funktion ingen färdig lösning ger.

### Ärlig jämförelse av de tre vägarna

| Väg | Arbete | Funktion (galleri/sök/album) | Månadskostnad (~4 TB) |
|---|---|---|---|
| Immich (hemma) | Lågt (drift) | Full | ~€2–3 el + backup |
| Immich (moln-VPS) | Lågt–medel | Full | ~€18–28 |
| Egen app + object storage | Medel (app) → Högt (om tittare) | Bara det du bygger | ~€16–24 lagring |
| rclone/färdig app + object storage | Lågt | Ingen tittare (bara filer i bucket) | ~€16–24 lagring |

---

## Appendix C — Lokal lagring som går att utöka med tiden

Nyckelinsikten: att kunna växa billigt över tid handlar mindre om hårdvaran och mer om vilken **lagringsteknik** du väljer. Du vill kunna lägga till **en disk i taget**, gärna i **blandade storlekar** ("4 TB idag, 16 TB när de är billiga"), och ändå ha skydd mot diskhaveri.

### Lagringsteknik — utbyggbarhet vs robusthet

| Teknik | Lägg till 1 disk i taget? | Blandade storlekar? | Skydd | Kommentar |
|---|---|---|---|---|
| **Unraid** | ✅ Ja | ✅ Ja | Paritet (1–2 diskar) | Bäst UX för stegvis växt. ~$49–129 engång. Kör Immich i Docker direkt. |
| **mergerfs + SnapRAID** | ✅ Ja | ✅ Ja | Schemalagd paritet | Gratis motsvarighet till Unraid. Paritet körs periodiskt (perfekt för foton: skriv-en-gång). Mer manuellt. |
| **Synology SHR** | ⚠️ Väx genom att byta upp diskar | ✅ Ja | RAID-1/-2 | Nybörjarvänligt, men bundet till Synologys hårdvara. |
| **ZFS (RAIDZ)** | ❌ Klumpigt (lägg till hela vdev; även med OpenZFS 2.3-expansion gillar den matchade diskar) | ❌ Helst lika stora | Realtids-checksums, scrub, snapshots | **Mest robust för dataintegritet**, men sämst för casual stegvis växt. ZFS-**speglar** (par i taget) är ett mellanting. |

**För en fotosamling (skriv-en-gång, läs-ofta) som ska växa billigt: Unraid eller mergerfs+SnapRAID är bäst.** Varje disk innehåller hela filer (läsbara var för sig), diskar kan spinna ner → låg effekt, och du lägger till valfri disk när som helst. ZFS är överlägset på integritet men passar sämre när målet är "slänga in en disk då och då".

### Hårdvara — välj fler fack än du behöver nu

Utbyggbarhet börjar med chassit: köp något med fler diskfack än du fyller idag.

- **Färdig NAS (enklast):** **UGREEN DXP4800 Plus** är 2026 års prisvärda val — 4 fack (utbyggbart mot fler via NVMe), Intel med **Quick Sync** (bra för Immichs videotranskodning + ML), 8 GB DDR5 (upp till 64 GB), **inga disklåsningar**, ~$640. Kör Immich i Docker direkt, eller installera TrueNAS/Unraid på den. QNAP TS-464 är likvärdig. Synology har dragit åt disklåsning — undvik om du vill ha frihet.
- **Bygg själv (billigast/flexiblast):** ett tornchassi med 6–8 fack + Unraid (eller mergerfs+SnapRAID på Debian). Återanvänd gammal hårdvara om du har; annars en Intel-plattform med Quick Sync. Max diskfrihet per krona.

### Disk- och layoutstrategi

1. **Skilj snabb och stor lagring:** Immichs **databas + OS på SSD** (gärna NVMe), **fotobiblioteket på HDD-arrayen**. DB:n vill ha snabb disk; bilderna inte.
2. **Starta lagom, lämna fack tomma:** t.ex. 2× 8–12 TB med en disk paritet → börja runt 8–12 TB användbart, väx genom att fylla facken.
3. **Välj teknik som tillåter enskild, blandad expansion** (Unraid/SnapRAID/SHR) — inte strikt RAIDZ.
4. **Paritet/RAID är INTE backup.** §5:s 3-2-1 gäller fortfarande: en lokal kopia till + en krypterad off-site (t.ex. Hetzner Storage Box eller object storage från Appendix A).

### Konkret startförslag

- **Lågt krångel:** UGREEN DXP4800 Plus + 2× 12 TB (1 disk redundans) + en liten NVMe för OS/DB. Väx genom att fylla resterande fack en disk i taget. Off-site backup via restic till Storage Box.
- **Billigast/mest flexibelt:** begagnat/byggt torn med 6 fack + Unraid + 2× stor HDD + 1 paritetsdisk + SSD för DB. Lägg till diskar när priset är rätt.

---

## Appendix D — Vad kostar den lokala lagringen?

Priser i EUR, ungefärliga (≈ USD just nu), och fluktuerar dagligen. Diskpriser per TB är lägst i **16–22 TB-spannet** (~€12–13/TB nytt, ~€7–10/TB för begagnade enterprise-diskar).

### Startkostnad (engång)

| | A: Färdig NAS (lågt krångel) | B: DIY-torn + Unraid (billigast) |
|---|---|---|
| Bas | UGREEN DXP4800 Plus (diskless) ~€600 | Begagnat/byggt torn (Quick Sync-CPU, 16 GB RAM, PSU, chassi) ~€250–400 |
| Mjukvara | Gratis (Docker direkt, eller Unraid/TrueNAS) | Unraid Starter $49 ≈ €46 (gratis: mergerfs+SnapRAID) |
| Diskar (data) | 2× 16 TB, 1 = paritet → ~16 TB användbart ~€380 | 2× 16 TB, 1 = paritet ~€380 (begagnat ~€220) |
| SSD/NVMe (OS + Immich-DB) | ~€40 | ~€40 |
| (ev. RAM-uppgradering) | ~€40–80 | ingår ovan |
| **Summa upfront** | **~€1 060–1 100** | **~€720–870** (mindre med begagnat) |

### Löpande kostnad (per månad)

| Post | Kostnad | Notering |
|---|---|---|
| **El** | ~€4–7/mån | ~30–50 W i snitt × 24/7 ≈ 260–440 kWh/år. Vid ~2 SEK/kWh ≈ 500–900 SEK/år. Diskar som spinner ner drar mindre. |
| **Off-site backup** | ~€13/mån (5 TB Storage Box), ~€20/mån (10 TB) | **Detta är den största löpande posten.** Krypterad restic-backup av bibliotek + DB. |
| Fjärråtkomst (Tailscale) | €0 | Gratis för privat bruk. |
| **Summa löpande** | **~€17–27/mån** | Varav backup ~€13–20. Hoppar du över moln-backup (t.ex. backup till väns hus) → bara el, ~€4–7/mån. |

> **Den löpande kostnaden domineras alltså av valet av off-site backup, inte av servern själv.** Servern hemma kostar i princip bara el att driva.

### Kostnad att växa

Att utöka = priset för en disk. ~€12–13/TB nytt, ~€7–10/TB begagnat enterprise. En extra 16 TB-disk ≈ €180–220. Med Unraid/SnapRAID slänger du in den i ett ledigt fack — ingen omkonfiguration, ingen ny array.

### Jämförelse mot moln över tid (≈ 10 TB foton, 5 år)

| | Upfront | Löpande | 5 år totalt | Du äger |
|---|---|---|---|---|
| **Lokal (B + 10 TB Storage Box-backup)** | ~€800 | ~€25/mån | **~€2 300** | Hårdvaran + kapacitet att växa vidare |
| **Allt-i-molnet** (object storage, ~€5/TB för 10 TB) | €0 | ~€50/mån | **~€3 000** | Inget; kostnaden växer linjärt med datan |

**Tumregel:** under ~2 TB är molnet billigast på kort sikt (ingen upfront). Från några TB och uppåt — och särskilt när samlingen växer — vinner lokalt tydligt, eftersom kapaciteten är köpt en gång medan molnet kostar per TB varje månad för alltid.

---

## Appendix E — Om du börjar litet (2–3 TB)

Vid 2–3 TB ändras kalkylen rejält: du behöver inte de stora 16 TB-diskarna eller en dyr 4-facks-NAS direkt. Notera dock att **små diskar är dyra per TB** — en 8 TB-disk (~€15/TB) är bättre köp än en 4 TB (~€20/TB), så börja hellre med 8 TB även om du bara fyller 2–3 TB: då har du växtutrymme på köpet.

### Tre startnivåer

| | Upfront | Löpande | Utbyggbar? |
|---|---|---|---|
| **1. Minimalt lokalt** – N100 mini-PC (16 GB, 512 GB SSD) ~€170 + 1× 8 TB ~€140 | **~€280–310** | ~€2/mån el + ~€3/mån kall off-site backup ≈ **~€5/mån** | Svagt (1–2 diskar). Migrera till NAS när du växer. |
| **2. Billig expanderbar** – begagnad SFF/torn-PC (4 SATA) ~€100–150 + Unraid $49 + 2× 8 TB (1 paritet → 8 TB) ~€280 | **~€430–480** | ~€4–6/mån el + ~€3–11/mån backup ≈ **~€7–17/mån** | ✅ Bra – lägg till disk i ledigt fack |
| **3. Färdig 4-facks-NAS** – UGREEN DXP4800 Plus ~€600 + 2× 8 TB (1 paritet) ~€280 + NVMe €40 | **~€920** | ~€4–6/mån el + backup | ✅ Bäst – plug & play, 4→9 fack |

> N100-mini-PC drar bara ~10–15 W → el ~€2/mån. En NAS med flera diskar ~30–40 W → ~€4–6/mån.

### Off-site backup vid liten datamängd

Här är haken: att backa 3 TB till **het** molnlagring (iDrive e2 ~$4/TB) kostar ~€11/mån — ungefär lika mycket som att bara ha allt i molnet. För backup du sällan återställer, välj **kall** lagring (AWS Glacier Deep Archive ~$1/TB → ~€3/mån för 3 TB), eller gör det gratis via en andra disk + en kopia hos familj/vän.

### Lokalt vs moln vid 3 TB

| | Upfront | Löpande | Bryt mot moln |
|---|---|---|---|
| **Allt-i-molnet** (object storage ~€5/TB, 3 TB) | €0 | ~€11–15/mån | — |
| **Minimalt lokalt (nivå 1)** + kall backup | ~€290 | ~€5/mån | Sparar ~€8–10/mån → **break-even ~2,5–3 år** |
| **Billig expanderbar (nivå 2)** | ~€450 | ~€7–10/mån | Break-even ~4–6 år, men byggt för att växa |

### Rekommendation för din situation (vill kunna växa)

Eftersom du sagt att du vill kunna **utöka med tiden**, är **nivå 2 (begagnad SFF/torn + Unraid + 2× 8 TB)** den bästa balansen: billig start (~€450), riktig redundans, och du lägger bara till en disk i taget när du växer — utan att köpa om boxen. Vill du ha noll krångel och snygg hårdvara: nivå 3. Vill du bara komma igång billigast möjligt och bryr dig mindre om elegant expansion: nivå 1, och migrera senare.

Oavsett nivå: börja med **8 TB-diskar** (inte 4 TB) för bättre pris/TB och växtutrymme, och kör Immichs databas på SSD/NVMe.
