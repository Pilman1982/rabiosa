// Firestore über die gewöhnliche Web-Schnittstelle (REST) lesen: eine einzelne, kurze Anfrage, unabhängig von
// der Live-Verbindung des SDK. Damit sieht das Handy nach, wenn die Live-Verbindung still steht.

export function restAdresse(config, pfad) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}`
    + `/databases/(default)/documents/${pfad}?key=${encodeURIComponent(config.apiKey)}`;
}

/** «2026-11-25T15:38:00.123678Z» -> Millisekunden, gerundet wie Timestamp.toMillis() im SDK und danach Math.round. */
function zeit(text) {
  const m = /^(.*?)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)$/.exec(String(text));
  if (!m) return Date.parse(text);
  const nanos = Number(((m[2] || '') + '000000000').slice(0, 9));
  return Math.round(Date.parse(m[1] + m[3]) + nanos / 1e6);
}

function wert(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return zeit(v.timestampValue);
  if ('mapValue' in v) return felder(v.mapValue?.fields);
  if ('arrayValue' in v) return (v.arrayValue?.values || []).map(wert);
  return null;
}

const felder = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, wert(v)]));

/** Dokument der REST-Schnittstelle als einfaches Objekt; «code» ist die Kennung des Dokuments. */
export function ausRest(dok) {
  if (!dok) return null;
  return { ...felder(dok.fields), code: String(dok.name || '').split('/').pop() };
}
