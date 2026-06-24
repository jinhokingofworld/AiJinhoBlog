import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;

type AddressResolver = (hostname: string) => Promise<string[]>;

export class UnsafeUrlError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "UnsafeUrlError";
    this.status = status;
  }
}

async function resolveHostname(hostname: string) {
  const records = await lookup(hostname, {
    all: true,
    verbatim: true,
  });

  return records.map((record) => record.address);
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [first, second] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];

  if (mappedIpv4) {
    return isPrivateIpv4(mappedIpv4);
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function isPrivateAddress(address: string) {
  const family = isIP(address);

  if (family === 4) {
    return isPrivateIpv4(address);
  }

  if (family === 6) {
    return isPrivateIpv6(address);
  }

  return true;
}

function parseHttpUrl(value: string | URL) {
  let url: URL;

  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    throw new UnsafeUrlError("올바른 URL이 필요합니다.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new UnsafeUrlError("http 또는 https URL만 사용할 수 있습니다.");
  }

  if (!url.hostname) {
    throw new UnsafeUrlError("URL host가 필요합니다.");
  }

  return url;
}

function normalizeHostname(hostname: string) {
  return hostname.replace(/^\[(.*)\]$/, "$1");
}

export async function assertPublicHttpUrl(
  value: string | URL,
  options: {
    resolveAddresses?: AddressResolver;
  } = {},
) {
  const url = parseHttpUrl(value);
  const resolveAddresses = options.resolveAddresses ?? resolveHostname;
  const hostname = normalizeHostname(url.hostname);
  let addresses: string[];

  try {
    addresses = isIP(hostname) ? [hostname] : await resolveAddresses(hostname);
  } catch {
    throw new UnsafeUrlError("URL host를 확인할 수 없습니다.");
  }

  if (!addresses.length) {
    throw new UnsafeUrlError("URL host를 확인할 수 없습니다.");
  }

  if (addresses.some(isPrivateAddress)) {
    throw new UnsafeUrlError("사설 네트워크 또는 로컬 주소는 사용할 수 없습니다.");
  }

  return url;
}

export async function fetchPublicHttpUrl(
  value: string | URL,
  init: RequestInit = {},
  options: {
    fetcher?: typeof fetch;
    maxRedirects?: number;
    resolveAddresses?: AddressResolver;
  } = {},
) {
  const fetcher = options.fetcher ?? fetch;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  let currentUrl = await assertPublicHttpUrl(value, options);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetcher(currentUrl, {
      ...init,
      redirect: "manual",
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    const location = response.headers.get("location");

    if (!location) {
      return response;
    }

    if (redirectCount === maxRedirects) {
      throw new UnsafeUrlError("URL redirect가 너무 많습니다.");
    }

    currentUrl = await assertPublicHttpUrl(new URL(location, currentUrl), options);
  }

  throw new UnsafeUrlError("URL redirect가 너무 많습니다.");
}
