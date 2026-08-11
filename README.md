# Verzamelde pagina’s

Een privé, local-first PWA voor een persoonlijke dichtbundel. De app kan gedichten lezen en doorzoeken, nieuwe teksten schrijven, versies bewaren, meerdere stemopnames per gedicht beheren en een complete ZIP-back-up maken.

## Wat is ingebouwd

- Bibliotheek met zoekfunctie, filters, tags, collectievolgorde en volledige leesweergave.
- Schrijfkamer met autosave, metadata en expliciete versiemomentopnames.
- Vergrendelde bronversies: geïmporteerde originelen kunnen niet stil worden overschreven.
- Opnamestudio met microfoontoestemming, aftellen, niveau-indicator, pauzeren, terugluisteren, meerdere takes, voorkeurstake, hernoemen, exporteren en audiobestand-import.
- IndexedDB-opslag op het apparaat, een verzoek om duurzame browseropslag en een opslagoverzicht.
- Versioned ZIP-back-up met menselijke Markdownkopieën, metadata, audio en SHA-256-controlesommen.
- Gecontroleerd herstellen met samenvoegen of volledig vervangen.
- Installeerbaar manifest, app-iconen, offline shell en een expliciete updateprompt.
- Hele-gedicht delen via het systeemdeelvenster en een zichtbare kopieeroptie als een ontvangende app tekst lastig overneemt.
- Iedere hoofdweergave en volledige leespagina opent bovenaan.
- Geen account, analytics, advertenties, externe lettertypen of automatische cloud-upload.

## De privégrens

De deploybare app bevat **geen gedichten en geen opnames**. De inhoud wordt na installatie lokaal geïmporteerd en blijft in IndexedDB van dat browserprofiel. De hostingconfig gebruikt geen D1-database en geen R2-opslag.

Het voorbereide bestand staat lokaal in:

`private-import/verzamelde-paginas-prive-import.json`

Deze map staat in `.gitignore`. Publiceer of deel dit bestand niet: het bevat de volledige privécollectie.

### Eerste ingebruikname

1. Open de PWA en kies **Importeer mijn gedichten**.
2. Selecteer `private-import/verzamelde-paginas-prive-import.json`.
3. Controleer op de bon of de aantallen gedichten en versies overeenkomen met het lokale importpakket.
4. Kies **Importeer verzameling**. De originelen blijven actief; aangepaste teksten zijn optionele aparte versies.
5. Open **Beheer & back-up**, vraag duurzame opslag aan en maak meteen een complete ZIP-back-up.

Browseropslag is praktisch maar niet hetzelfde als een harde schijf: een browserprofiel kan worden verwijderd. De ZIP-back-up is daarom een essentieel onderdeel van het ontwerp.

## Privévoorbereiding van de bestaande collectie

De corpus-specifieke generator, bronfingerprints en randgevallen staan uitsluitend in de genegeerde lokale map `private-import/`. Ze maken bewust geen deel uit van de publieke repository of Git-geschiedenis. Het gegenereerde importpakket blijft de overdraagbare privébron voor de eerste ingebruikname; nieuwe gedichten worden daarna rechtstreeks in de app geschreven en via de complete ZIP-back-up bewaard.

## Lokaal ontwikkelen

Vereisten: Node.js 22.13 of nieuwer. Op Windows wordt `npm.cmd` gebruikt omdat PowerShell het `npm.ps1`-script kan blokkeren.

```powershell
npm.cmd install
npm.cmd run dev
```

Belangrijke controles:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
```

`npm.cmd test` maakt eerst een schone productiebuild en controleert daarna server-rendering, PWA-assets, de private import, data-invarianten, ZIP round-trip en de privacygrens. Wanneer het lokale importpakket beschikbaar is, vergelijkt de privacycontrole ieder gedicht en iedere versie met de deploybare output.

## Technische opzet

- React 19 + Vinext, geschikt voor OpenAI Sites/Cloudflare Workers.
- Dexie bovenop IndexedDB voor gedichten, versies, opnames en appinstellingen.
- `MediaRecorder` en Web Audio voor eigen stemopnames; bestand-import is de fallback.
- `fflate` voor portable ZIP-export en -herstel.
- Zelf gehoste Fontsource-lettertypen; geen runtime-aanroepen naar Google Fonts of CDN’s.
- Handgeschreven service worker die alleen de app-shell en statische assets cachet. Poëzie en audio gaan nooit naar Cache Storage.

## Ondersteuningsgrens

Live opnemen vereist HTTPS of `localhost` en een browser met `MediaRecorder`. Het precieze audioformaat verschilt per browser; de app detecteert het best ondersteunde formaat en bewaart MIME-type en extensie. Voor een browser zonder live opname blijft **Audiobestand importeren** beschikbaar.

De app doet geen cloudsynchronisatie. Wie dezelfde bibliotheek op een tweede apparaat wil, maakt op apparaat A een ZIP-back-up en herstelt die handmatig op apparaat B.

## GitHub Pages en toekomstige updates

Naast de bestaande Vinext/Sites-build heeft dit project een aparte statische Vite-build voor GitHub Pages. De workflow in `.github/workflows/deploy-pages.yml` voert bij iedere push naar `main` automatisch lint, typecontrole, beide productiebuilds, tests en privacycontroles uit. Alleen wanneer alles slaagt wordt `pages-dist` gepubliceerd.

Geïnstalleerde appkopieën controleren bij starten, terugkeren naar de app, opnieuw online komen en periodiek op een nieuwe versie. Een update wordt eerst gedownload en daarna zichtbaar aangeboden. Activeren blijft een bewuste keuze, zodat een lopende opname of nog te bewaren schrijfwijziging niet door een stille herlaadactie verloren gaat. Lokale IndexedDB-inhoud wordt niet door een app-shellupdate gewist.

GitHub Pages publiceert uitsluitend de lege app-shell. De repository en website zijn publiek; gedichten en opnames zijn dat niet. Een GitHub projectsite deelt technisch wel dezelfde `username.github.io`-origin met andere projectsites van hetzelfde account. Voor maximale browseropslag-isolatie is een eigen domein of afzonderlijke hostnaam sterker dan een URL-subpad.

Browseropslag is per origin. Inhoud die eerder onder een andere host is geïmporteerd verschijnt daarom niet automatisch in de Pages-versie: importeer daar eenmalig het lokale privé-importpakket of herstel een complete ZIP-back-up.

Lokale releasecontrole vóór publiceren:

```powershell
npm.cmd run release:local
```

De strikte lokale privacycontrole vereist het genegeerde privé-importpakket en vergelijkt ieder gedicht en iedere versie met zowel de Sites- als Pages-output. Publieke CI kan zonder dat privébestand alleen de structurele grens controleren.
