import { createClient } from "@supabase/supabase-js";
import { Database } from "../types/supabase";

const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL || "",
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
);

export default supabase;