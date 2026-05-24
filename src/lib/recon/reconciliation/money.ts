// Deterministic decimal money math for Agent 2.
//
// All arithmetic runs on bigint mantissas so FX conversion and residuals never
// touch IEEE-754 floats. Money values are non-negative decimal strings in the
// shared schema, but residuals computed here may be signed (short payments).

type Decimal = { mantissa: bigint; scale: number };

function parse(value: string): Decimal {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fracPart = ""] = unsigned.split(".");
  const digits = `${intPart}${fracPart}`;
  const mantissa = BigInt(digits === "" ? "0" : digits) * (negative ? -1n : 1n);
  return { mantissa, scale: fracPart.length };
}

function pow10(exp: number): bigint {
  return 10n ** BigInt(exp);
}

// Re-express a decimal at a higher (never lower) scale without losing precision.
function rescaleUp(d: Decimal, scale: number): bigint {
  return d.mantissa * pow10(scale - d.scale);
}

// Round a mantissa at `scale` down to `targetScale`, half away from zero.
function roundTo(mantissa: bigint, scale: number, targetScale: number): bigint {
  if (scale <= targetScale) {
    return mantissa * pow10(targetScale - scale);
  }
  const divisor = pow10(scale - targetScale);
  const quotient = mantissa / divisor;
  const remainder = mantissa % divisor;
  const twiceRemainder = (remainder < 0n ? -remainder : remainder) * 2n;
  if (twiceRemainder >= divisor) {
    return quotient + (mantissa < 0n ? -1n : 1n);
  }
  return quotient;
}

function format(mantissa: bigint, scale: number): string {
  const negative = mantissa < 0n;
  const digits = (negative ? -mantissa : mantissa).toString().padStart(scale + 1, "0");
  const cut = digits.length - scale;
  const intPart = digits.slice(0, cut);
  const fracPart = scale > 0 ? `.${digits.slice(cut)}` : "";
  return `${negative ? "-" : ""}${intPart}${fracPart}`;
}

// foreignAmount * fxRate, rounded to 2 decimal places (currency minor units).
export function multiplyMoneyByRate(amount: string, rate: string): string {
  const a = parse(amount);
  const r = parse(rate);
  const product = a.mantissa * r.mantissa;
  const productScale = a.scale + r.scale;
  return format(roundTo(product, productScale, 2), 2);
}

// Signed difference a - b, at the larger of the two input scales.
export function subtractMoney(a: string, b: string): string {
  const da = parse(a);
  const db = parse(b);
  const scale = Math.max(da.scale, db.scale);
  return format(rescaleUp(da, scale) - rescaleUp(db, scale), scale);
}

export function absMoney(value: string): string {
  const d = parse(value);
  return format(d.mantissa < 0n ? -d.mantissa : d.mantissa, d.scale);
}

export function isNegativeMoney(value: string): boolean {
  return parse(value).mantissa < 0n;
}

export function compareMoney(a: string, b: string): number {
  const da = parse(a);
  const db = parse(b);
  const scale = Math.max(da.scale, db.scale);
  const diff = rescaleUp(da, scale) - rescaleUp(db, scale);
  if (diff > 0n) return 1;
  if (diff < 0n) return -1;
  return 0;
}

// abs(residual) / expectedLocal as a fraction (e.g. 0.0117 == 1.17%).
// Returns Infinity when expectedLocal is zero (no usable FX scenario).
export function residualPercent(residual: string, expectedLocal: string): number {
  const expected = Number(expectedLocal);
  if (expected === 0) return Number.POSITIVE_INFINITY;
  return Math.abs(Number(residual)) / Math.abs(expected);
}
