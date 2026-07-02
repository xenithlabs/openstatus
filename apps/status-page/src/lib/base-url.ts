export function resolveProtocol(customDomain: string): string {
  // localhost-family domains and loopback IPs don't have TLS.
  if (
    customDomain.includes("localhost") ||
    customDomain.startsWith("127.") ||
    customDomain.startsWith("[::1]")
  ) {
    return "http://";
  }
  return "https://";
}

export function getBaseUrl({
  slug,
  customDomain,
}: {
  slug?: string;
  customDomain?: string;
}) {
  if (process.env.NODE_ENV === "development") {
    return `http://localhost:3000/${slug}`;
  }
  if (customDomain) {
    return `${resolveProtocol(customDomain)}${customDomain}`;
  }
  return `https://${slug}.openstatus.dev`;
}
