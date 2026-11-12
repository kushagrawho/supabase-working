
// ==========================================
// SUPABASE CONNECTION
// ==========================================

const SUPABASE_URL = "https://zmoawtoghoxkjooyxvux.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_8VUgObp03jkwpkqyHGaz3g_pDzcS9n1";

// Create Supabase client
const { createClient } = window.supabase;

window.supabaseClient = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

console.log("Supabase client initialized successfully.");
