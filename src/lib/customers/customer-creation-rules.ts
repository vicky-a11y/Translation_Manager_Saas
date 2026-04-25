/** 與 DB / 表單規格一致之客戶建立規則（前後端共用邏輯）。 */

export const IM_PLATFORMS = ["LINE", "WhatsApp", "WeChat", "Email"] as const;
export type ImPlatform = (typeof IM_PLATFORMS)[number];

export const CUSTOMER_COUNTRY_CODES = [
  "TW",
  "CN",
  "HK",
  "MY",
  "SG",
  "ID",
  "TH",
  "VN",
  "PH",
  "JP",
  "KR",
  "US",
  "GB",
  "DE",
  "FR",
  "AU",
] as const;

export function isEnterpriseCustomerType(customerType: number): boolean {
  return customerType === 2 || customerType === 4;
}

/** 開票類型：1二聯 2三聯 3電子 4國外 5捐贈（022） */
export function defaultInvoiceTypeForCustomerType(customerType: number): number {
  if (customerType === 2) return 2;
  if (customerType === 4) return 4;
  if (customerType === 3) return 4;
  return 1;
}

export function defaultImPlatformForCountry(countryCode: string): ImPlatform {
  return countryCode.toUpperCase() === "TW" ? "LINE" : "WhatsApp";
}

export function isValidTwEnterpriseTaxId(taxId: string): boolean {
  return /^\d{8}$/.test(taxId.trim());
}
