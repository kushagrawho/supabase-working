
/* ==========================================
   VASUNDHARA - SHARED DATABASE HELPERS
========================================== */

(function () {
    const supabase = window.supabaseClient;

    if (!supabase) {
        console.error("Supabase client is not initialized.");
        return;
    }

    // Check whether a valid authenticated user exists.
    
    async function getCurrentUser() {
    // First check whether a session exists.
    const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

    if (sessionError) {
        throw sessionError;
    }

    // No session means nobody is logged in.
    if (!sessionData.session) {
        return null;
    }

    // Verify the authenticated user with Supabase.
    const { data, error } = await supabase.auth.getUser();

    if (error) {
        throw error;
    }

    return data.user;
}


    // Require authentication before database operations.
    async function requireAuth() {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error("You must be logged in to access business data.");
        }

        return user;
    }

    // Read records from a table.
    async function dbSelect(table, columns = "*") {
        await requireAuth();

        return await supabase
            .from(table)
            .select(columns);
    }

    // Insert one or more records.
    async function dbInsert(table, records) {
        await requireAuth();

        return await supabase
            .from(table)
            .insert(records)
            .select();
    }

    // Update records using equality filters.
    async function dbUpdate(table, values, filters) {
        await requireAuth();

        let query = supabase
            .from(table)
            .update(values);

        Object.entries(filters).forEach(([column, value]) => {
            query = query.eq(column, value);
        });

        return await query.select();
    }

    // Delete records using equality filters.
    async function dbDelete(table, filters) {
        await requireAuth();

        let query = supabase
            .from(table)
            .delete();

        Object.entries(filters).forEach(([column, value]) => {
            query = query.eq(column, value);
        });

        return await query.select();
    }

    // Make the shared helpers available to other JS files.
    window.VasundharaDB = {
        supabase,
        getCurrentUser,
        requireAuth,
        select: dbSelect,
        insert: dbInsert,
        update: dbUpdate,
        delete: dbDelete
    };

    console.log("Vasundhara database helpers initialized.");

})();
