# IconicWall — Render Service

Servizio che produce il post brandizzato IconicWall **con lo stesso identico motore** della skill iw-post
(HTML + Chromium, font Italiana, oro sulla parola-perno, logo, super-campionamento a 1080×1350).
n8n lo chiama via HTTP, riceve il JPEG, e lo carica su Drive. Gira in cloud, PC spento.

## Cosa fa
`POST /render`
- **Header** `x-api-key: <RENDER_KEY>` (se hai impostato la variabile RENDER_KEY)
- **Body multipart**:
  - `photo` = file immagine (la foto reale, inviata da n8n come binario)
  - `config` = JSON string con i campi del post:
    ```json
    {
      "eyebrow": "MATERIA",
      "title1": "Cento finiture.<br>Una <span class=\"accent\">parete</span>.",
      "position": "BL",
      "bgpos": "center",
      "size": 80,
      "site": "iconicwall.it"
    }
    ```
- **Risposta**: `image/jpeg` (il post finito 1080×1350).

Regole titolo/accento identiche a quelle fissate in Notion: una frase per riga (`<br>` a fine frase),
parola-perno in `<span class="accent">…</span>` dentro `title1`, niente campo `accent` separato.

`GET /health` → `ok`

## Deploy (scegli un host, tutti supportano Docker)
Consigliati: **Railway**, **Render**, **Fly.io** (piani economici, Docker nativo).

Passi tipici (Railway/Render):
1. Crea un repo (GitHub) con questi file, oppure carica la cartella.
2. Nuovo servizio → "Deploy from Dockerfile".
3. Imposta la variabile d'ambiente **RENDER_KEY** con una chiave segreta a tua scelta (serve a proteggere l'endpoint; la stessa chiave la metterai SOLO nelle credenziali n8n, mai in chat).
4. Deploy. Ottieni un URL pubblico, es. `https://iconicwall-render.up.railway.app`.
5. Prova: `GET https://…/health` deve rispondere `ok`.

## Collegamento a n8n (workflow branding)
Nel workflow che brandizza (parte dai post Notion "In bozza" con foto):
1. **Google Drive → Download** la foto scelta (binario `data`).
2. **HTTP Request** → `POST https://<tuo-servizio>/render`
   - Header `x-api-key` = RENDER_KEY (da credenziale n8n).
   - Body: **Form-Data / Multipart** →
     - campo `photo` = il binario `data` (tipo: n8n binary)
     - campo `config` = JSON string coi campi del post (eyebrow, title1, position, bgpos, size, site).
   - Response Format = **File** (esce il JPEG come binario).
3. **Google Drive → Upload** il JPEG nella cartella "1 · Da approvare" (parentId 1c6haWTrrchWRQsBTKei9VHk5lK2n_ZGp).
4. **Notion → Update** la pagina: Stato "Da approvare", GraficaID = ID del file caricato.

Da qui in poi lo spostamento per stato (Programmato → Pubblicato) è già automatico (workflow "Vera — Sposta post").

## Nota qualità
È lo stesso `render.js` = stesso HTML/CSS/font/logo + `sharp` per il super-campionamento (lanczos3 + sharpen),
equivalente al passo PIL attuale. Prima di andare in produzione: rendi un post di prova e confrontalo con
l'attuale — devono coincidere.
