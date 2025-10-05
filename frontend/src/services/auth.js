import api from "../api";

export async function login(email, password, tenant = "demo") {
  // persist tenant so interceptor can attach it
  localStorage.setItem("tenant", tenant);
  const { data } = await api.post("/api/auth/login", { email, password });
  localStorage.setItem("token", data.token);
  return data.user;
}

export function logout() {
  localStorage.removeItem("token");
}
