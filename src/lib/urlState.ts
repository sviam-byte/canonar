export function encodeState(obj: any) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)));
}
export function decodeState(s: string) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(s))));
  } catch { return null; }
}
