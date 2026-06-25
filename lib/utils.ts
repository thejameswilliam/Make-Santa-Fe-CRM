import clsx, { type ClassValue } from "clsx";

export const CRM_TIME_ZONE = "America/Denver";

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
  rsquo: "'",
  lsquo: "'",
  rdquo: "\"",
  ldquo: "\"",
  ndash: "-",
  mdash: "-",
  hellip: "...",
  copy: "©",
  reg: "®",
  trade: "™"
};

export function cn(...values: ClassValue[]) {
  return clsx(values);
}

export function decodeHtmlEntities(value?: string | null) {
  if (typeof value !== "string" || !value.includes("&")) {
    return value ?? null;
  }

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (fullMatch, entity: string) => {
    const normalizedEntity = entity.toLowerCase();

    if (normalizedEntity.startsWith("#x")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : fullMatch;
    }

    if (normalizedEntity.startsWith("#")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : fullMatch;
    }

    return HTML_ENTITY_MAP[normalizedEntity] ?? fullMatch;
  });
}

export function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatCurrency(amountCents?: number | null, currency = "USD") {
  if (amountCents === null || amountCents === undefined) {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).format(amountCents / 100);
}

const CRM_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CRM_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short"
});

const CRM_DATE_ONLY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CRM_TIME_ZONE,
  dateStyle: "medium"
});

const CRM_TIME_ONLY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CRM_TIME_ZONE,
  timeStyle: "short"
});

const CRM_DATE_INPUT_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CRM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const CRM_DATE_TIME_INPUT_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CRM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

const CRM_MONTH_KEY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CRM_TIME_ZONE,
  year: "numeric",
  month: "2-digit"
});

const CRM_OFFSET_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CRM_TIME_ZONE,
  timeZoneName: "shortOffset",
  hour: "2-digit",
  hourCycle: "h23"
});

type CrmLocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
};

function parseDateValue(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDateValueOrThrow(value: string | Date) {
  const date = parseDateValue(value);
  if (!date) {
    throw new RangeError("Invalid time value");
  }

  return date;
}

function readFormatterParts(formatter: Intl.DateTimeFormat, date: Date) {
  return formatter.formatToParts(date).reduce<Record<string, string>>((parts, part) => {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }

    return parts;
  }, {});
}

function getCrmOffsetMilliseconds(date: Date) {
  const offsetLabel = CRM_OFFSET_FORMATTER.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  if (offsetLabel === "GMT") {
    return 0;
  }

  const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(offsetLabel);
  if (!match) {
    return 0;
  }

  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");

  return sign * ((hours * 60) + minutes) * 60_000;
}

function buildUtcTimestamp(parts: CrmLocalDateParts) {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    parts.millisecond ?? 0
  );
}

function buildCrmLocalDate(parts: CrmLocalDateParts) {
  const targetTimestamp = buildUtcTimestamp(parts);
  let utcTimestamp = targetTimestamp;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offsetMilliseconds = getCrmOffsetMilliseconds(new Date(utcTimestamp));
    const nextTimestamp = targetTimestamp - offsetMilliseconds;

    if (nextTimestamp === utcTimestamp) {
      break;
    }

    utcTimestamp = nextTimestamp;
  }

  return new Date(utcTimestamp);
}

function buildDateInputString(parts: Record<string, string>) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function buildDateTimeInputString(parts: Record<string, string>) {
  return `${buildDateInputString(parts)}T${parts.hour}:${parts.minute}`;
}

function parseDateInputParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

export function formatDateTime(value: string | Date) {
  return CRM_DATE_TIME_FORMATTER.format(getDateValueOrThrow(value));
}

export function formatDateOnly(value: string | Date) {
  return CRM_DATE_ONLY_FORMATTER.format(getDateValueOrThrow(value));
}

export function formatTimeOnly(value: string | Date) {
  return CRM_TIME_ONLY_FORMATTER.format(getDateValueOrThrow(value));
}

export function formatInCrmTimeZone(value: string | Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CRM_TIME_ZONE,
    ...options
  }).format(getDateValueOrThrow(value));
}

export function formatDateInputValue(value: string | Date) {
  return buildDateInputString(readFormatterParts(CRM_DATE_INPUT_FORMATTER, getDateValueOrThrow(value)));
}

export function formatDateTimeInputValue(value: string | Date) {
  return buildDateTimeInputString(readFormatterParts(CRM_DATE_TIME_INPUT_FORMATTER, getDateValueOrThrow(value)));
}

export function getCurrentDateTimeInputValue() {
  return formatDateTimeInputValue(new Date());
}

export function parseDateTimeInputValue(value: string) {
  const trimmedValue = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(trimmedValue);
  if (!match) {
    return null;
  }

  const date = buildCrmLocalDate({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5])
  });

  return formatDateTimeInputValue(date) === trimmedValue ? date : null;
}

export function parseDateInputStart(value: string) {
  const trimmedValue = value.trim();
  const parts = parseDateInputParts(value);
  if (!parts) {
    return null;
  }

  const date = buildCrmLocalDate(parts);
  return formatDateInputValue(date) === trimmedValue ? date : null;
}

export function parseDateInputEnd(value: string) {
  const trimmedValue = value.trim();
  const parts = parseDateInputParts(value);
  if (!parts) {
    return null;
  }

  const date = buildCrmLocalDate({
    ...parts,
    hour: 23,
    minute: 59,
    second: 59,
    millisecond: 999
  });

  return formatDateInputValue(date) === trimmedValue ? date : null;
}

export function formatMonthKey(value: string | Date) {
  const parts = readFormatterParts(CRM_MONTH_KEY_FORMATTER, getDateValueOrThrow(value));
  return `${parts.year}-${parts.month}`;
}

export function startOfCrmDay(value: string | Date) {
  return parseDateInputStart(formatDateInputValue(value));
}

export function startOfCrmMonth(value: string | Date) {
  const [year, month] = formatMonthKey(value).split("-").map(Number);
  return buildCrmLocalDate({
    year,
    month,
    day: 1
  });
}

export function addCrmDays(value: string | Date, count: number) {
  const [year, month, day] = formatDateInputValue(value).split("-").map(Number);

  return startOfCrmDay(new Date(Date.UTC(year, month - 1, day + count, 12)));
}

export function addCrmMonths(value: string | Date, count: number) {
  const [year, month] = formatMonthKey(value).split("-").map(Number);

  return startOfCrmMonth(new Date(Date.UTC(year, month - 1 + count, 1, 12)));
}

export function parseOptionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCurrencyAmountToCents(value?: string | null) {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const normalized = value.replace(/[$,\s]/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

export function formatPhoneNumber(value?: string | null) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return trimmed;
}
