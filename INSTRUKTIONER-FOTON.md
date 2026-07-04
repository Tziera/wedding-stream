# Festbilder → din OneDrive

Gästerna kan nu fotografera direkt via sidan (eller välja bilder ur galleriet),
och bilderna sparas automatiskt i en mapp i din OneDrive.

Eftersom sidan är helt statisk (bara `index.html`) kan den inte prata säkert
med OneDrive på egen hand — då skulle dina Microsoft-nycklar ligga öppna i
sidkoden. Därför finns en liten "mellanhand" i mappen `worker/`: en
**Cloudflare Worker** (gratis) som tar emot bilderna och sparar dem i din
OneDrive via Microsoft Graph.

Det finns två vägar att välja på:

| | Vad gästerna ser | Jobb för dig |
|---|---|---|
| **Alternativ A** (rekommenderas) | Fotografera/välj bilder direkt på sidan, snygg uppladdning med förloppsindikator | ~15 min engångsinstallation |
| **Alternativ B** (reservplan) | En knapp som öppnar en OneDrive-delningsmapp där de laddar upp själva | ~2 min |

---

## Alternativ A — uppladdning direkt från sidan (rekommenderas)

### Steg 1: Skapa Cloudflare-konto och installera verktyget

1. Skapa ett gratis konto på [cloudflare.com](https://dash.cloudflare.com/sign-up) (om du inte redan har ett).
2. Installera [Node.js](https://nodejs.org) om du inte har det, och kör sedan i en terminal:

   ```bash
   npm install -g wrangler
   wrangler login
   ```

### Steg 2: Skapa lagringsutrymme och driftsätt workern

Stå i mappen `worker/` i det här projektet:

```bash
cd worker
wrangler kv namespace create TOKENS
```

Kommandot skriver ut ett `id` (en lång bokstavs-/sifferkombination).
Öppna `worker/wrangler.toml` och klistra in det där det står `FYLL_I_HAR`.

Driftsätt sedan:

```bash
wrangler deploy
```

Notera adressen som skrivs ut, t.ex. `https://brollopsfoto.dittkonto.workers.dev`
— den behövs i steg 4 och 5.

### Steg 3: Registrera en app hos Microsoft (så workern får prata med din OneDrive)

1. Gå till [portal.azure.com](https://portal.azure.com) och logga in med
   **samma Microsoft-konto som äger din OneDrive**.
2. Sök på **App registrations** → **New registration**.
3. Fyll i:
   - **Name:** t.ex. `Brollopsfoto`
   - **Supported account types:** välj det sista alternativet,
     *"Accounts in any organizational directory … and personal Microsoft accounts"*
   - **Redirect URI:** välj plattform **Web** och skriv in
     `https://DIN-WORKER-ADRESS/auth/callback`
     (adressen från steg 2, t.ex. `https://brollopsfoto.dittkonto.workers.dev/auth/callback`)
4. Klicka **Register**.
5. På översiktssidan: kopiera **Application (client) ID**.
6. Gå till **Certificates & secrets** → **New client secret**.
   Välj längsta giltighetstiden (24 månader) och kopiera **Value**
   (visas bara en gång!).

### Steg 4: Lägg in hemligheterna i workern

I terminalen, fortfarande i mappen `worker/`:

```bash
wrangler secret put MS_CLIENT_ID       # klistra in Application (client) ID
wrangler secret put MS_CLIENT_SECRET   # klistra in klienthemlighetens Value
wrangler secret put UPLOAD_KEY         # hitta på ett eget lösenord, t.ex. "festfoto-8aug"
```

`UPLOAD_KEY` är en enkel spärr så att inte vem som helst som hittar
worker-adressen kan skicka filer till dig.

### Steg 5: Koppla din OneDrive (engångsinloggning)

Öppna i webbläsaren (byt ut adress och nyckel):

```
https://DIN-WORKER-ADRESS/auth/start?key=DIN_UPLOAD_KEY
```

Logga in med Microsoft-kontot som äger OneDriven och godkänn.
När du ser **"Klart! ❀"** är kopplingen sparad — detta behöver bara göras en gång.

Du kan när som helst kontrollera status genom att öppna worker-adressen direkt
(`https://DIN-WORKER-ADRESS/`).

### Steg 6: Fyll i uppgifterna i `index.html`

Öppna `index.html` och leta upp konfigurationsblocket högst upp i skriptet:

```js
const PHOTO_UPLOAD_URL      = "https://brollopsfoto.dittkonto.workers.dev";
const PHOTO_UPLOAD_KEY      = "festfoto-8aug";   // samma som UPLOAD_KEY
const ONEDRIVE_FALLBACK_URL = "";
```

Ladda upp/publicera sidan igen. Klart!

Bilderna hamnar i mappen **"Bröllopsbilder 2026"** i din OneDrive
(namnet kan ändras i `worker/wrangler.toml`). Varje fil får datum, klockslag
och gästens namn i filnamnet, t.ex.
`2026-08-08_21.30.15_Anna_IMG_1234.jpg`.

### Testa innan festen!

1. Öppna sidan på mobilen, logga in med gästlösenordet.
2. Tryck **"Ta en bild"** — kameran öppnas, ta ett kort, godkänn.
3. Kolla att bilden dyker upp i OneDrive-mappen inom några sekunder.

---

## Alternativ B — reservplan utan worker (2 minuter)

Om du inte vill sätta upp workern:

1. Skapa en mapp i OneDrive, t.ex. "Bröllopsbilder 2026".
2. Högerklicka på mappen → **Dela** → ställ in **"Alla som har länken kan redigera"**
   → kopiera länken.
3. Klistra in länken i `index.html`:

   ```js
   const PHOTO_UPLOAD_URL      = "";
   const PHOTO_UPLOAD_KEY      = "";
   const ONEDRIVE_FALLBACK_URL = "https://1drv.ms/f/s!ABC123...";
   ```

Gästerna får då en knapp **"Ladda upp bilder ❀"** som öppnar mappen i
OneDrive, där de kan ladda upp sina bilder via Microsofts eget gränssnitt.
(Mindre smidigt: inget kameraläge direkt på sidan, och alla med länken kan
även se varandras bilder.)

---

## Bra att veta

- **Kostnad:** allt är gratis (Cloudflares gratisnivå räcker till
  100 000 uppladdningar per dag — det lär räcka ;)
- **Stora bilder** krymps automatiskt i telefonen till max 3000 pixlar innan
  de skickas, så det går snabbt även på festens WiFi. Skulle krympningen
  misslyckas skickas originalet i stället, även stora filer fungerar.
- **Klienthemligheten** i Azure går ut efter max 24 månader — bröllopet
  8 augusti 2026 ligger gott och väl inom det, så länge du skapar den nu.
- **Om sidan visar "OneDrive är inte kopplat ännu"** vid uppladdning:
  gör om steg 5.
- Fotosektionen visas bara när `PHOTO_UPLOAD_URL` eller
  `ONEDRIVE_FALLBACK_URL` är ifylld — tills dess ser sidan ut precis som förut.
