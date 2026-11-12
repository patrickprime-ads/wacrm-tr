/**
 * Celular brasileiro com e sem o 9 (Prime, 11/11/2026): o WhatsApp às vezes identifica o número sem o 9
 * (55 49 8874-2084) e o rastreio/formulário com o 9 (55 49 98874-2084). Os dois são a mesma pessoa.
 */
export function variantesTelefoneBR(phone: string): string[] {
  const d = String(phone || "").replace(/\D/g, "");
  const out = new Set([d]);
  if (d.startsWith("55") && d.length === 12 && /[6-9]/.test(d[4])) out.add(`${d.slice(0, 4)}9${d.slice(4)}`);
  if (d.startsWith("55") && d.length === 13 && d[4] === "9" && /[6-9]/.test(d[5])) out.add(`${d.slice(0, 4)}${d.slice(5)}`);
  return [...out].filter(Boolean);
}
