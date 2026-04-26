import {type NextRequest, NextResponse} from "next/server";

import {defaultLocale, locales, type AppLocale} from "@/i18n/routing";
import {createClient} from "@/lib/supabase/server";
import {getSupabasePublishableKey, getSupabaseUrl} from "@/lib/supabase/keys";

function isLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value);
}

function clearSupabaseCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") || cookie.name.toLowerCase().includes("supabase")) {
      response.cookies.delete(cookie.name);
    }
  }
}

export async function GET(request: NextRequest, {params}: {params: Promise<{locale: string}>}) {
  const {locale: localeParam} = await params;
  const locale: AppLocale = isLocale(localeParam) ? localeParam : defaultLocale;

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}/login`;
  url.search = "";

  const response = NextResponse.redirect(url);

  if (getSupabaseUrl() && getSupabasePublishableKey()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  clearSupabaseCookies(request, response);

  return response;
}
