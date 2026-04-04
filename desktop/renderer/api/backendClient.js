import axios from 'axios';

const backendClient = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/v1',
  timeout: 15000,
});

backendClient.interceptors.request.use(async (config) => {
  try {
    const token = await window.electronAPI.invoke('auth:get-token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // If electronAPI unavailable (browser dev), skip token
  }
  return config;
});

backendClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.message || err.message || 'Request failed';
    return Promise.reject(new Error(msg));
  }
);

export default backendClient;
