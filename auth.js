
// ==========================================
// VASUNDHARA AUTHENTICATION
// ==========================================

(function () {
    const supabase = window.supabaseClient;

    if (!supabase) {
        console.error("Supabase client is not initialized.");
        return;
    }

    // Create login screen
    const loginScreen = document.createElement("div");
    loginScreen.id = "vasundharaLoginScreen";

    loginScreen.innerHTML = `
        <div class="login-card">
            <div class="login-brand">Vasundhara</div>
            <h2>Welcome Back</h2>
            <p class="login-subtitle">
                Sign in to access your business dashboard.
            </p>

            <form id="vasundharaLoginForm">
                <label for="loginEmail">Email address</label>
                <input
                    type="email"
                    id="loginEmail"
                    placeholder="Enter your email"
                    autocomplete="username"
                    required
                >

                <label for="loginPassword">Password</label>
                <input
                    type="password"
                    id="loginPassword"
                    placeholder="Enter your password"
                    autocomplete="current-password"
                    required
                >

                <p id="loginError" class="login-error"></p>

                <button type="submit" id="loginButton">
                    Sign In
                </button>
            </form>

            <p class="login-footer">
                Secure business access
            </p>
        </div>
    `;

    document.body.appendChild(loginScreen);

    // Keep the application inaccessible until authentication succeeds.
    
    function showLogin() {
    document.body.classList.add("auth-locked");
    loginScreen.style.display = "flex";
}

    function hideLogin() {
    loginScreen.style.display = "none";
    document.body.classList.remove("auth-locked");
}

    // Handle login form submission
    document.getElementById("vasundharaLoginForm")
        .addEventListener("submit", async function (event) {
            event.preventDefault();

            const email = document.getElementById("loginEmail").value.trim();
            const password = document.getElementById("loginPassword").value;
            const errorElement = document.getElementById("loginError");
            const loginButton = document.getElementById("loginButton");

            errorElement.textContent = "";
            loginButton.disabled = true;
            loginButton.textContent = "Signing in...";

            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) {
                    throw error;
                }

                if (!data.session) {
                    throw new Error("Login session could not be created.");
                }

                hideLogin();

            } catch (error) {
                console.error("Login failed:", error);
                errorElement.textContent =
                    error.message || "Unable to sign in. Please try again.";

            } finally {
                loginButton.disabled = false;
                loginButton.textContent = "Sign In";
            }
        });

    // Check whether a valid session already exists.
    async function checkExistingSession() {
        showLogin();

        try {
            const { data, error } = await supabase.auth.getSession();

            if (error) {
                throw error;
            }

            if (data.session) {
                hideLogin();
            } else {
                showLogin();
            }

        } catch (error) {
            console.error("Session check failed:", error);
            showLogin();
        }
    }

    // React to login, logout and session changes.
    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            hideLogin();
        } else {
            showLogin();
        }
    });

    // Start authentication check.
    checkExistingSession();

// ==========================================
// LOGOUT
// ==========================================

const logoutButton = document.getElementById("vasundharaLogoutBtn");

if (logoutButton) {
    logoutButton.addEventListener("click", async function () {
        logoutButton.disabled = true;

        try {
            const { error } = await supabase.auth.signOut();

            if (error) {
                throw error;
            }

            console.log("Logged out successfully.");

        } catch (error) {
            console.error("Logout failed:", error);
            alert("Unable to log out. Please try again.");

        } finally {
            logoutButton.disabled = false;
        }
    });
}


})();
