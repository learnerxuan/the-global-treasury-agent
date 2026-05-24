// ─── Reference ────────────────────────────────────────────────────────────────

export function normalize_reference(input: string | null): string | null {
  if (input === null) return null;
  const result = input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return result.length > 0 ? result : null;
}

// ─── Party Name ───────────────────────────────────────────────────────────────

// Ordered longest-first so compound suffixes ("Pte Ltd") match before bare ones ("Ltd")
// [\s,]+ (one or more spaces/commas) before the suffix prevents stripping
// "Corp" from within a name like "MegaCorp" (no space before it)
const LEGAL_SUFFIX_RE = new RegExp(
  String.raw`[\s,]+(Pte\.?\s+Ltd|Sdn\.?\s+Bhd|Sendirian\s+Berhad|Pty\.?\s+Ltd|Incorporated|Corporation|Berhad|Limited|GmbH|Pty|Inc|Ltd|LLC|LLP|Corp|Co\.?|Bhd)\s*\.?\s*$`,
  "i"
);

export function normalize_party_name(input: string | null): string | null {
  if (input === null) return null;
  let name = input.trim();
  let prev: string;
  do {
    prev = name;
    name = name.replace(LEGAL_SUFFIX_RE, "").trim();
  } while (name !== prev && name.length > 0);
  const result = name.toUpperCase();
  return result.length > 0 ? result : null;
}

// ─── Date ─────────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T/;

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1]!;
}

// Never uses new Date() — timezone-unsafe for date-only extraction
export function normalize_date(input: string | null): string | null {
  if (input === null) return null;
  if (ISO_DATE_RE.test(input)) return isValidIsoDate(input) ? input : null;
  if (ISO_DATETIME_RE.test(input)) {
    const dateOnly = input.slice(0, 10);
    return isValidIsoDate(dateOnly) ? dateOnly : null;
  }
  return null;
}

// ─── Currency Amount ──────────────────────────────────────────────────────────

const ISO_CURRENCY_CODE_RE = /^[A-Z]{3}\s+/;
const CURRENCY_SYMBOL_RE = /^(RM|S\$|\$|€|£|¥)\s*/;
const VALID_DECIMAL_RE = /^(0|[1-9]\d*)(\.\d+)?$/;

// Returns a non-negative decimal string, or null for negative/invalid input.
// Never uses parseFloat() or Number() — keeps value as string throughout.
export function normalize_currency_amount(input: string | null): string | null {
  if (input === null) return null;
  let s = input.trim();
  s = s.replace(ISO_CURRENCY_CODE_RE, "");
  s = s.replace(CURRENCY_SYMBOL_RE, "");
  s = s.replace(/,/g, "").trim();
  return VALID_DECIMAL_RE.test(s) ? s : null;
}
