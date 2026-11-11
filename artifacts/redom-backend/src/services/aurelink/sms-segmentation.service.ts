/**
 * Count billable SMS segments using GSM-7 septet rules, including extension
 * characters, or UCS-2 UTF-16 code units when any character is outside GSM-7.
 * Concatenated messages use the standard 153/67 unit capacities.
 */
export function countSmsSegments(message: string): number {
  const value = String(message ?? "");
  if (!value.length) return 1;
  const gsmBasicCharacter = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà]$/;
  const gsmExtension = new Set(["\f", "^", "{", "}", "\\", "[", "]", "~", "|", "€"]);
  let septets = 0;
  for (const character of value) {
    if (gsmBasicCharacter.test(character)) septets += 1;
    else if (gsmExtension.has(character)) septets += 2;
    else {
      const units = value.length;
      return units <= 70 ? 1 : Math.ceil(units / 67);
    }
  }
  return septets <= 160 ? 1 : Math.ceil(septets / 153);
}
