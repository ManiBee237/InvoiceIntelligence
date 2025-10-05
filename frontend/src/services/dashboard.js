import api from "../api";

export async function fetchDashboard() {
  const { data } = await api.get("/api/dashboard/summary");
  return data;
}
