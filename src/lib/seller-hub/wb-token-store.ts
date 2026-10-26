import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SELLER_HUB_WB_MARKETPLACE_ID,
  SELLER_HUB_WB_SHOP_ID,
  type SellerHubSecretDb,
} from "./wb-token";

export function supabaseSellerHubSecretDb(supabase: SupabaseClient): SellerHubSecretDb {
  return {
    async findHub(userId) {
      const { data, error } = await supabase
        .from("auto_reply_marketplace_secrets")
        .select("api_key_ciphertext")
        .eq("user_id", userId)
        .eq("shop_id", SELLER_HUB_WB_SHOP_ID)
        .eq("marketplace_id", SELLER_HUB_WB_MARKETPLACE_ID)
        .maybeSingle();
      if (error) throw new Error("seller hub secret read failed");
      const ciphertext = data?.api_key_ciphertext;
      return typeof ciphertext === "string" && ciphertext ? { ciphertext } : null;
    },
    async upsertHub(userId, ciphertext) {
      const { error } = await supabase.from("auto_reply_marketplace_secrets").upsert(
        {
          user_id: userId,
          shop_id: SELLER_HUB_WB_SHOP_ID,
          marketplace_id: SELLER_HUB_WB_MARKETPLACE_ID,
          api_key_ciphertext: ciphertext,
          client_id: null,
          campaign_id: null,
          business_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,shop_id,marketplace_id" },
      );
      if (error) throw new Error("seller hub secret write failed");
    },
    async deleteHub(userId) {
      const { error } = await supabase
        .from("auto_reply_marketplace_secrets")
        .delete()
        .eq("user_id", userId)
        .eq("shop_id", SELLER_HUB_WB_SHOP_ID)
        .eq("marketplace_id", SELLER_HUB_WB_MARKETPLACE_ID);
      if (error) throw new Error("seller hub secret delete failed");
    },
  };
}
