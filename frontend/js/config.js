// Single place to point the frontend at the backend API
// Local dev: leave as-is (matches backend/.env.example PORT)
// Production: replace with your deployed backend URL, e.g
//   window.API_BASE_URL = "https://taskboard-api.onrender.com";
window.API_BASE_URL = window.API_BASE_URL || "http://localhost:5175";
