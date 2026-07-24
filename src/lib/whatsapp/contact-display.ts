const GENERIC_NAMES = new Set([
  "contato do whatsapp",
  "desconhecido",
  "sem nome",
  "você",
  "voce",
  "you",
]);

export function isWhatsAppInternalId(value?: string | null) {
  return String(value || "").replace(/\D/g, "").length >= 14;
}

export function formatBrazilianPhone(value?: string | null) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return null;
}

export function whatsappContactDisplayName(
  name?: string | null,
  phone?: string | null,
) {
  const savedName = name?.trim();
  const normalizedName = savedName?.toLowerCase() || "";
  if (
    savedName &&
    !GENERIC_NAMES.has(normalizedName) &&
    !isWhatsAppInternalId(savedName) &&
    !/^\d+$/.test(savedName)
  ) {
    return savedName;
  }
  return formatBrazilianPhone(phone) || "Número não disponibilizado";
}
