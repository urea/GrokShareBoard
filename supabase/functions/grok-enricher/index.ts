import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

/**
 * Grok Enricher (Inactive Mode)
 * 
 * 以前 Grok の user_id 特定を試みましたが、Grok 側の動的生成仕様により
 * 生HTMLからの特定が困難であること、および直接のリソースアクセスが制限されていることを踏まえ、
 * 現在この関数の処理は停止（パススルー）しています。
 * 
 * Webhook 設定とインフラは将来の拡張（別のメタデータ取得など）のために維持しています。
 */
serve(async (req) => {
  try {
    const payload = await req.json();
    console.log("Webhook triggered (Inactive mode):", payload?.record?.id);

    return new Response(JSON.stringify({ 
      status: "inactive", 
      message: "Metadata enrichment is currently disabled by design." 
    }), { 
      status: 200, 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
});
