// Shared logic for index.html (login) and register.html

function showBanner(message, kind = "error") {
  const banner = document.getElementById("banner");
  if (!message) {
    banner.innerHTML = "";
    return;
  }
  banner.innerHTML = `<div class="banner banner--${kind}">${escapeHtml(message)}</div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function setLoading(button, loading, idleLabel) {
  button.disabled = loading;
  button.textContent = loading ? "Please wait…" : idleLabel;
}

// Already-authenticated users skip straight to the board.
if (Auth.isLoggedIn() && (location.pathname.endsWith("index.html") || location.pathname === "/" || location.pathname.endsWith("register.html"))) {
  location.href = "board.html";
}

const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showBanner("");
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const btn = document.getElementById("submit-btn");

    setLoading(btn, true, "Sign in");
    try {
      const { token, user } = await Api.login(email, password);
      Auth.setSession(token, user);
      location.href = "board.html";
    } catch (err) {
      showBanner(err.message);
      setLoading(btn, false, "Sign in");
    }
  });
}

const registerForm = document.getElementById("register-form");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showBanner("");
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const btn = document.getElementById("submit-btn");

    if (password.length < 8) {
      showBanner("Password must be at least 8 characters.");
      return;
    }

    setLoading(btn, true, "Create account");
    try {
      const { token, user } = await Api.register(name, email, password);
      Auth.setSession(token, user);
      location.href = "board.html";
    } catch (err) {
      showBanner(err.message);
      setLoading(btn, false, "Create account");
    }
  });
}