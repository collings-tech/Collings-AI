import { create } from 'zustand';

const useAppStore = create((set) => ({
  user: null,
  sites: [],
  activeSite: null,
  chatHistory: {},
  isLoading: false,
  theme: localStorage.getItem('theme') || 'dark',

  setUser: (user) => set({ user }),
  setSites: (sites) => set({ sites }),
  setActiveSite: (site) => set({ activeSite: site }),
  setChatHistory: (siteId, messages) =>
    set((state) => ({
      chatHistory: { ...state.chatHistory, [siteId]: messages },
    })),
  appendMessage: (siteId, message) =>
    set((state) => ({
      chatHistory: {
        ...state.chatHistory,
        [siteId]: [...(state.chatHistory[siteId] || []), message],
      },
    })),
  setLoading: (isLoading) => set({ isLoading }),
  toggleTheme: () => set((state) => {
    const next = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    if (next === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
    return { theme: next };
  }),
  logout: () => set({ user: null, sites: [], activeSite: null, chatHistory: {} }),
}));

export default useAppStore;
