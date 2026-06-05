// ---- value parsers (cellFormat=string → numbers) ----

export function parseNum(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, "").replace(/%/g, ""));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

export function parseRate(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    if (v.includes("%")) return parseFloat(v) / 100;
    return parseFloat(v);
  }
  return null;
}

export function extractDateStr(v) {
  if (!v) return null;
  const m = String(v).match(/(\d{4})\/(\d{2})\/(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// ---- Vika API ----

export async function fetchVikaRecords(datasheetId, viewId, token, sortField, sortOrder) {
  const url = new URL(`https://api.vika.cn/fusion/v1/datasheets/${datasheetId}/records`);
  url.searchParams.set("viewId", viewId);
  url.searchParams.set("fieldKey", "name");
  url.searchParams.set("cellFormat", "string");
  url.searchParams.set("pageSize", "500");
  url.searchParams.set("sort[0][field]", sortField);
  url.searchParams.set("sort[0][order]", sortOrder || "desc");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vika API error ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(`Vika API: ${json.message}`);
  return json.data.records;
}
