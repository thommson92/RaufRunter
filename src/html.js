// html.js — gemeinsame Helfer für die Template-Strings der Ansichten.

/** Text für die Ausgabe in innerHTML entschärfen (Namen sind freie Eingaben). */
export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
