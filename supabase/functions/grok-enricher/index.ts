import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  const reqId = Math.random().toString(36).substring(7);

  try {
    const payload = await req.json();
    const record = payload.record;
    if (!record || !record.url) return new Response("No URL", { status: 400 });

    const grokUrl = record.url;
    const postUuid = grokUrl.match(/post\/([a-f0-9-]{36})/)?.[1];
    if (!postUuid) return new Response("Not a Grok UUID URL", { status: 200 });

    console.log(`[${reqId}] Target: ${grokUrl}`);
    const response = await fetch(grokUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" }
    });

    const html = await response.text();
    
    // --- PINPOINT STRATEGY: Extract webAppId ---
    // Extracting the specific ID used in the script tag
    const webAppIdMatch = html.match(/webAppId:\\?"([a-f0-9-]{36})\\?"/i);
    let userId = webAppIdMatch ? webAppIdMatch[1] : null;

    // Fallback: If pinpoint match fails, use the UUID filter logic as backup
    if (!userId) {
      console.log(`[${reqId}] Pinpoint match failed, using UUID filter fallback.`);
      const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      const allUuids = html.match(uuidRegex) || [];
      const others = Array.from(new Set(allUuids.filter(id => id.toLowerCase() !== postUuid.toLowerCase())));
      if (others.length > 0) userId = others[0];
    }

    if (userId) {
      const videoUrl = `https://assets.grok.com/users/${userId}/generated/${postUuid}/generated_video.mp4`;
      console.log(`[${reqId}] IDENTIFIED grok_user_id: ${userId}`);
      
      const { error: updateError } = await supabase.from('posts').update({ 
        video_url: videoUrl
        // user_id は投稿者ハッシュのため上書き禁止
      }).eq('id', record.id);

      if (updateError) throw updateError;
      return new Response(JSON.stringify({ status: "success", userId, videoUrl }), { status: 200 });
    }

    console.log(`[${reqId}] FAILED: Could not identify user_id from HTML.`);
    return new Response(JSON.stringify({ status: "not_found" }), { status: 200 });

  } catch (err) {
    console.error(`[${reqId}] Fatal Error:`, err);
    return new Response(err.message, { status: 500 });
  }
});
