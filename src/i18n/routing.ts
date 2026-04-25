import {defineRouting} from "next-intl/routing";

export const routing = defineRouting({
  locales: ["zh-TW", "zh-CN", "en", "ms"],
  defaultLocale: "zh-TW",
  localePrefix: "always",
  localeDetection: true,
});

export type AppLocale = (typeof routing.locales)[number];

export const locales = routing.locales;
export const defaultLocale = routing.defaultLocale;
