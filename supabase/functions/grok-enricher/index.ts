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
serve(async (req: Request): Promise<Response> => {
  try {
    // 取得したリクエストをログに記録するのみ
    const payload = await req.json().catch(() => ({}));
    console.log("Webhook triggered (Inactive mode):", payload?.record?.id || "No ID");

    return new Response(JSON.stringify({ 
      status: "inactive", 
      message: "Metadata enrichment is currently disabled by design." 
    }), { 
      status: 200, 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Webhook unexpected error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
