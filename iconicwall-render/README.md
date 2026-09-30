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

### Layout Iconic (template v3) e IconicDress
Con `layout` nel `config` il render risponde con un **PNG 1080×1350** (`image/png`, `grafica.png`).
Senza `layout` vale il layout storico qui sopra, invariato. Specifica: Notion «Iconic — Template grafica post v3».

| brand | layout | file multipart | campi propri del config |
|---|---|---|---|
| `iconic` | `prima_dopo` | `imageBefore`, `imageAfter` | `focusBefore`, `focusAfter`, `seam` |
| `iconic` | `stat` | `photo` (facoltativa: fondo scuro velato) | `stat` e `statFonte` **obbligatori**, `statLabel`, `statSize`, `focus` |
| `iconic` | `campionario` | `finiture` × 4, 6 o 9 | `codici` (uno per finitura, stesso ordine) |
| `iconic` | `contract` | `photo` | `indice` **obbligatorio** (1-99 → «N° 0X»), `focus` |
| `iconic` | `confronto` | nessuno | `chips` (max 4), `barrato` (default Sostituire), `vivo` (default Rivestire) |
| `iconicdress` | `diagonale` | `imageBefore`, `imageAfter` | `focusBefore`, `focusAfter`, `diagonal`, `seam` |

Per `iconicdress` il campo `layout` è obbligatorio.

```json
{
  "brand": "iconic",
  "layout": "prima_dopo",
  "eyebrow": "Riqualificazione retail",
  "title1": "Stesso banco cassa,<br>tutta un'altra «presenza»",
  "site": "iconicoriginal.it",
  "focusBefore": "50,50",
  "focusAfter": "60,40"
}
```

- Titolo (`title1`, obbligatorio tranne che in `confronto`): stessa convenzione del layout storico (`<br>`,
  `<span class="accent">` oppure «»). Se c'è `accent` e nel titolo non è marcato niente, si colora quella parola dentro
  il titolo (o va a capo, se non c'è). Al massimo **due righe** e **una sola** parola in oro, altrimenti 400. Il punto
  finale si toglie. Il corpo parte da `size` e scende finché il titolo ci sta.
- `focus`, `focusBefore`, `focusAfter`: punto focale del ritaglio, percentuali x,y (`"40,60"`, `[40,60]` o `{x,y}`),
  default 50/50.
- `stat`: solo numeri veri e verificati (Linea Editoriale Iconic). Il render non può controllarli, per questo pretende
  `statFonte` (da dove viene il numero; non si stampa): senza, 400.
- `confronto`: nessuna parola di denaro (costi, costo, euro, €, prezzo, risparmio, spesa, budget…) in titolo, eyebrow,
  parole e chips: 400. Il vecchio chip «meno costi» non passa.
- `diagonal` (solo `diagonale`): dove la linea tocca il bordo alto e il bordo basso della foto, in percentuale della
  larghezza, `"alto,basso"`. Default `"100,0"`, da angolo ad angolo.
- `seam`: `"chiaro"` o `"scuro"` per forzare il colore della cucitura; di norma lo sceglie la luminosità delle foto.
- Le finiture del campionario non ricevono il trattamento foto: restano col colore del campione.

### Errori
`400` con il motivo nel testo quando: il brand non è fra `iconicwall`, `iconic`, `iconicdress`; il layout non esiste
per quel brand; manca una foto; una foto non è JPEG/PNG/WebP (un HEIC, per esempio); `config` non è JSON; il titolo
ha più di due righe o più di una parola in oro; mancano i campi obbligatori del layout. Nessun ripiego silenzioso.

`POST /reel` risponde 400 (non 500) con brand sconosciuto o `config` non JSON, prima di montare.

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
