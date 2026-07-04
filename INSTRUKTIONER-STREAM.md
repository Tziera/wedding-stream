# Livesändningen — så funkar den

Sidan har två roller, som styrs av vilket lösenord man loggar in med
(båda ändras högst upp i skriptet i `index.html`):

| Roll | Lösenord (nuvarande) | Vad de ser |
|---|---|---|
| **Gäst** | `august2026` | Ser sändningen (och fotosektionen) |
| **Admin/filmare** | `admin8aug` | Samma sida + panelen "Hantera sändning" |

Sändningen går via **Agora.io** — en streamingtjänst med gratisnivå.
App-ID:t (`aaedf3f9538d4a5f91267c247ccad9ae`) och kanalnamnet
(`brollop2026`) ligger redan inlagda i `index.html`.

---

## Under bröllopet — steg för steg för den som filmar

1. Öppna sidan på telefonen och logga in med **admin-lösenordet**.
2. Sätt telefonen på laddning och kontrollera WiFi/4G.
3. Tryck **"Starta sändning"** och tillåt kamera + mikrofon när
   webbläsaren frågar.
4. Klart — alla gäster som är inne på sidan ser nu bilden inom några
   sekunder. En röd **"Sänder live"**-markering visas hos dig.

Under sändningen finns tre knappar:

- **Stoppa** — avslutar sändningen.
- **Byt kamera** — växlar mellan bak- och framkamera (bakkameran är
  standard, den har bäst kvalitet).
- **Ljud av / Ljud på** — tystar mikrofonen tillfälligt.

Skärmen hålls automatiskt vaken på filmarens telefon under sändningen
(wake lock), men ha ändå laddaren i.

Gästerna behöver inte göra något — sidan ansluter automatiskt när de
loggat in, och videon dyker upp så fort sändningen startar. Om någon
kommer in sent fungerar det också; de ser sändningen från att de ansluter
(det är en direktsändning, ingen inspelning).

---

## Token — behövs det eller inte?

I admin-panelen finns ett fält för **token**. Om det behövs beror på hur
Agora-projektet är inställt:

- Är projektet i **testläge ("App ID only"/utan certifikat)** → lämna
  fältet tomt. Enklast, och helt okej för ett bröllop.
- Har projektet **App Certificate aktiverat** → då kräver Agora ett token.
  Logga in på [console.agora.io](https://console.agora.io), gå till ditt
  projekt → **Generate temp token**, ange kanalnamnet `brollop2026`,
  och klistra in token i fältet innan du trycker "Starta sändning".
  **OBS:** temp-tokens gäller max 24 timmar — generera det samma dag
  som bröllopet, inte veckan innan!

Kolla vilket läge projektet har: [console.agora.io](https://console.agora.io)
→ Projects → titta på ditt projekt. Vet du inte — testa utan token först;
får du token-fel vid start så säger felmeddelandet det.

---

## Räcker gratisnivån?

Agoras gratisnivå är **10 000 deltagarminuter per månad**, och varje
tittare räknas. Exempel: en vigsel på 1 timme med 20 tittare =
20 × 60 = 1 200 minuter, plus den som filmar. Även med generös marginal
(flera timmar, fler tittare) ryms ett bröllop gott och väl — men undvik
att låta en testsändning stå på i timmar med många anslutna dagarna innan.

---

## Testa innan (viktigt!)

Gör ett generalprov **dagen innan**, gärna på samma plats:

1. Öppna sidan på filmartelefonen, logga in som admin, starta sändningen.
2. Öppna sidan på en annan telefon/dator, logga in som gäst — syns bilden
   och hörs ljudet?
3. Gå runt med filmartelefonen där du tänker filma — håller WiFi:t/4G:t?
4. Stoppa sändningen efteråt (så du inte drar deltagarminuter i onödan).

---

## Om något strular

- **"Kamera/mikrofon nekades"** — tillåt åtkomst i webbläsarens
  inställningar (på iPhone: Inställningar → Safari → Kamera/Mikrofon).
- **"Kameran används av en annan app"** — stäng andra appar som använder
  kameran och försök igen.
- **Token-fel** — se token-avsnittet ovan; kontrollera att token är
  nygenererat och för rätt kanal (`brollop2026`), eller lämna tomt om
  projektet är i testläge.
- **Gästerna ser bara "Sändningen börjar snart"** — sändningen är inte
  igång, eller så tappade filmartelefonen anslutningen. Starta om
  sändningen; be gästerna ladda om sidan om det inte hjälper.
- **Hackig bild** — oftast nätverket hos filmaren. Gå närmare routern
  eller växla till 4G/5G.
