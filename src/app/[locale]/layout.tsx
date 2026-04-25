import type {Metadata} from "next";
import {NextIntlClientProvider} from "next-intl";
import {getMessages} from "next-intl/server";

import {TooltipProvider} from "@/components/ui/tooltip";
import {locales} from "@/i18n/routing";

import "./globals.css";

export const metadata: Metadata = {
  title: "企業翻譯平台管理系統TMS",
};

export function generateStaticParams() {
  return locales.map((locale) => ({locale}));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const messages = await getMessages();

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <TooltipProvider delay={0}>
          <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}

