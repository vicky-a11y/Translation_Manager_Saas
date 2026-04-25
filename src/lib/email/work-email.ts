const CONSUMER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.com.tw",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "qq.com",
  "163.com",
  "126.com",
  "proton.me",
  "protonmail.com",
]);

export function extractDomainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase().trim();
}

export function isLikelyConsumerEmail(email: string): boolean {
  const domain = extractDomainFromEmail(email);
  if (!domain) return true;
  return CONSUMER_DOMAINS.has(domain);
}
