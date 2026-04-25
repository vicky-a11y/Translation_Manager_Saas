import {createServerClient} from "@supabase/ssr";
import {type NextRequest, NextResponse} from "next/server";

import {getSupabasePublishableKey, getSupabaseUrl} from "@/lib/supabase/keys";

export function createSupabaseMiddlewareClient(request: NextRequest, response: NextResponse) {
  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({name, value, options}) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}
