// profile-ui.js — Darstellung rund um Spielerprofile: Avatare, Foto-Aufbereitung
// und die Such-Combobox zur Spielerauswahl. Browser-Kram (Canvas, DOM-Strings);
// die Fachlogik liegt in profile-model.js.

import { identiconSvg } from './identicon.js';
import { esc } from './html.js';

/** Kantenlänge, auf die das fertig zugeschnittene Foto verkleinert wird. */
const PHOTO_SIZE = 256;
// Obergrenze für das fertige Bild. Firestore erlaubt 1 MiB pro Dokument, aber
// der engere Deckel gilt der Render-Last: das Bild steckt in jeder Profil-Liste
// und in jedem Vorschlag der Suchliste. 256px/q0.8 liegt real bei 10–20 KB.
const MAX_PHOTO_CHARS = 60 * 1024;
// Obergrenze für die Zuschnitt-Vorschau (nicht das Endergebnis): begrenzt den
// Speicherbedarf auf älteren Handys — ein 4000×3000-Foto aus der Kamera wäre
// unverkleinert ~48 MB als Canvas, das Zuschnitt-Widget braucht dafür nie
// mehr Auflösung, als selbst beim 4×-Zoom aus PHOTO_SIZE herauskommt.
const CROP_SOURCE_SIZE = 1024;

/**
 * Ist das eine eingebettete Bild-Data-URL? Base64 enthält keine Zeichen, die in
 * einem Attribut ausbrechen könnten — die Prüfung ersetzt deshalb das Escapen
 * (ein voller Regex-Scan über 20 KB pro Avatar und Render).
 */
const isEmbeddedImage = (url) => typeof url === 'string' && /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]*$/.test(url);

/**
 * Avatar eines Profils als HTML-Schnipsel.
 * @param {object|null} profile
 * @param {number} [size] Kantenlänge in px
 */
export function avatarHtml(profile, size = 28) {
  const box = (inner) =>
    `<span class="avatar" style="width:${size}px;height:${size}px">${inner}</span>`;
  if (!profile) return box('<span class="avatar-empty">?</span>');
  // Nur eingebettete Bilder zulassen: die Collection ist offen beschreibbar,
  // eine fremde http-URL im src wäre ein Aufruf an einen fremden Host bei jedem
  // Betrachter (und bräche die Offline-Zusage der PWA).
  if (profile.avatar?.type === 'photo' && isEmbeddedImage(profile.avatar.dataUrl)) {
    return box(
      `<img class="avatar-img" src="${profile.avatar.dataUrl}" alt="" width="${size}" height="${size}"/>`,
    );
  }
  return box(identiconSvg(profile.avatar?.seed || profile.id, size));
}

/** Avatar + Name nebeneinander (Listen, Zeilen in der Eingabe). */
export function avatarNameHtml(profile, name, size = 24) {
  return `<span class="avatar-name">${avatarHtml(profile, size)}<span>${esc(name)}</span></span>`;
}

/**
 * Bilddatei laden und auf eine für den Zuschnitt handhabbare Größe bringen.
 * Das Ergebnis ist die Quelle für den Zuschnitt-Dialog (`photo-crop.js`) —
 * der Nutzer wählt darauf noch Ausschnitt & Zoom, bevor irgendetwas
 * gespeichert wird.
 * @param {File} file
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function loadPhotoSource(file) {
  if (!file.type.startsWith('image/')) throw new Error('Bitte ein Bild auswählen.');
  const img = await loadImage(file);
  try {
    const scale = Math.min(1, CROP_SOURCE_SIZE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    if (typeof img.close === 'function') img.close();
  }
}

/**
 * Den vom Nutzer gewählten Ausschnitt (`crop-model.js`-`sourceRect`, in
 * Pixelkoordinaten von `source`) zu einem quadratischen JPEG-DataURL machen.
 * Wird direkt im Profil-Dokument gespeichert — kein Storage-Bucket nötig.
 * @param {HTMLCanvasElement} source von loadPhotoSource()
 * @param {{sx:number, sy:number, side:number}} rect
 * @returns {string} data:image/jpeg;base64,…
 */
export function cropToDataUrl(source, rect) {
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  canvas
    .getContext('2d')
    .drawImage(source, rect.sx, rect.sy, rect.side, rect.side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  if (dataUrl.length > MAX_PHOTO_CHARS) {
    throw new Error('Das Bild ist zu groß. Bitte ein kleineres Foto wählen.');
  }
  return dataUrl;
}

/**
 * Bilddatei laden. `createImageBitmap` dreht das Bild anhand der EXIF-Daten
 * gerade (Handy-Fotos im Hochformat) — wo es das nicht kann, tut es der
 * <img>-Fallback in allen aktuellen Browsern von selbst.
 */
async function loadImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
        img.src = url;
      });
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * Such-Combobox für die Spielerauswahl.
 * @param {object} state
 * @param {number|string} state.key eindeutiger Bezeichner der Zeile (data-i)
 * @param {object|null} state.profile aktuell gewähltes Profil
 * @param {string} state.query aktuelle Sucheingabe
 * @param {object[]} state.matches Vorschläge (bereits gefiltert & sortiert)
 * @param {boolean} state.nameTaken trägt die Eingabe schon ein anderes Profil?
 * @param {string} [state.placeholder]
 */
export function pickerHtml(state) {
  const { key, profile, query, placeholder = 'Spieler suchen …' } = state;
  // Die Vorschlagsliste startet immer leer und wird erst beim Öffnen gefüllt
  // (openPicker) — sonst müsste jeder Render alle Avatare aller Profile bauen.
  return `
    <div class="picker">
      <div class="picker-field">
        ${avatarHtml(profile, 28)}
        <input data-pquery="${esc(key)}" value="${esc(profile ? profile.name : query)}"
          placeholder="${esc(placeholder)}" autocomplete="off" autocapitalize="words"
          spellcheck="false" enterkeyhint="done" />
        ${
          profile
            ? `<button class="icon-btn btn-ghost" data-action="picker-clear" data-i="${esc(
                key,
              )}" title="Auswahl aufheben">✕</button>`
            : ''
        }
      </div>
      <div class="picker-list" data-picker-list></div>
    </div>`;
}

/**
 * Nur die Vorschlagsliste — beim Tippen wird ausschließlich dieser Teil neu
 * gesetzt, damit das Eingabefeld den Fokus (und die Cursorposition) behält.
 */
export function pickerOptionsHtml({ key, query, matches, nameTaken }) {
  const name = (query || '').trim();
  const options = matches
    .map(
      (p) => `
      <button class="picker-option" data-action="pick-profile" data-i="${esc(key)}" data-pid="${esc(
        p.id,
      )}">${avatarHtml(p, 28)}<span>${esc(p.name)}</span></button>`,
    )
    .join('');

  // Nicht anbieten, wenn der Name schon vergeben ist — der Klick endete sonst
  // garantiert in „gibt es schon".
  const create =
    name && !nameTaken
      ? `<button class="picker-option picker-create" data-action="create-profile" data-i="${esc(
          key,
        )}">➕ <span>„${esc(name)}" als neues Profil anlegen</span></button>`
      : '';

  if (!options && !create) {
    return '<p class="picker-empty">Noch keine Profile — tippe einen Namen, um eins anzulegen.</p>';
  }
  return options + create;
}
