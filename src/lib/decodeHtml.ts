/**
 * Decodes HTML entities (including double/multi-encoded ones like
 * "&amp;amp;K" → "&K"). Safety net for any data that escaped the
 * server-side cleanup in the sync functions.
 */
export function decodeHtml(text: string | null | undefined): string {
  if (!text) return "";
  if (typeof document === "undefined") return text;

  const textarea = document.createElement("textarea");
  let result = text;
  let previous = "";
  let iterations = 0;

  while (result !== previous && iterations < 5) {
    previous = result;
    textarea.innerHTML = result;
    result = textarea.value;
    iterations++;
  }

  return result;
}
