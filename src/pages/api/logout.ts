// src/pages/api/logout.ts
import type { APIRoute } from "astro";
import { createServerClient } from "../../lib/supabaseClient";

export const POST: APIRoute = async (context) => {
  try {
    const supabase = createServerClient(context);

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Supabase Logout Error:", error.message);

      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
      });
    }

    return context.redirect("/");
  } catch (e: any) {
    console.error("Logout API Route - Unexpected error:", e.message);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred during logout." }),
      { status: 500 }
    );
  }
};
