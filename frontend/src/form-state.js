// Requests and draft comparison share one explicit input shape. No birth data is persisted.
export function formRequest(form) {
  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());
  delete data.style;
  data.styles = fd.getAll("style");
  data.surname = String(data.surname || "").trim();
  data.variant = 0;
  return data;
}
export function requestKey(data = {}) {
  const defaults = {
    purpose: "newborn",
    mode: "due_date",
    gender: "unknown",
    zone: "Asia/Shanghai",
    length: "2",
    candidateCount: "3",
    dueTime: "12:00",
    elementPreference: "yongshen",
    timeBasis: "civil",
  };
  const names = [
    "surname",
    "purpose",
    "mode",
    "gender",
    "zone",
    "length",
    "candidateCount",
    "dueDate",
    "dueTime",
    "birthDate",
    "birthTime",
    "place",
    "parents",
    "currentName",
    "meaning",
    "likedChars",
    "avoidedChars",
    "elementPreference",
    "timeBasis",
    "longitude",
    "locationId",
  ];
  const normalized = Object.fromEntries(
    names.map((key) => [key, String(data[key] ?? defaults[key] ?? "").trim()]),
  );
  for (const key of ["length", "candidateCount"])
    if (normalized[key] && Number.isFinite(Number(normalized[key])))
      normalized[key] = String(Number(normalized[key]));
  if (normalized.purpose !== "rename") normalized.currentName = "";
  if (normalized.timeBasis !== "apparent_solar") {
    normalized.longitude = "";
    normalized.locationId = "";
  } else if (
    normalized.longitude &&
    Number.isFinite(Number(normalized.longitude))
  )
    normalized.longitude = String(Number(normalized.longitude));
  normalized.styles = [
    ...new Set(Array.isArray(data.styles) ? data.styles : []),
  ].sort();
  normalized.honorParents = [true, "true", "1", "on"].includes(
    data.honorParents,
  );
  return JSON.stringify(normalized);
}
