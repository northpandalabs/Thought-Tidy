function sanitizeText(str) {
  return String(str ?? "").replace(/\0/g, "").replace(/<[^>]*>/g, "").trim();
}

function sanitizeContent(str) {
  return String(str ?? "").replace(/\0/g, "").trim();
}
