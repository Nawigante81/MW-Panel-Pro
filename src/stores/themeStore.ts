import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  currentUserId: string | null;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  syncThemeForUser: (userId?: string | null) => void;
}

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const resolveTheme = (theme: Theme): 'light' | 'dark' => {
  if (theme === 'system') return getSystemTheme();
  return theme;
};

const applyThemeClass = (resolved: 'light' | 'dark') => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(resolved);
};

const getUserThemeKey = (userId: string) => `mwpanel-theme-user:${userId}`

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      resolvedTheme: resolveTheme('system'),
      currentUserId: null,
      setTheme: (theme: Theme) => {
        const resolved = resolveTheme(theme);
        set({ theme, resolvedTheme: resolved });
        applyThemeClass(resolved);
        if (typeof window !== 'undefined') {
          const userId = get().currentUserId
          if (userId) {
            localStorage.setItem(getUserThemeKey(userId), theme)
          }
        }
      },
      toggleTheme: () => {
        const current = get().theme === 'dark' ? 'light' : 'dark';
        get().setTheme(current);
      },
      syncThemeForUser: (userId) => {
        if (typeof window === 'undefined') return
        if (!userId) {
          set({ currentUserId: null })
          return
        }
        const saved = localStorage.getItem(getUserThemeKey(userId)) as Theme | null
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          const resolved = resolveTheme(saved)
          set({ currentUserId: userId, theme: saved, resolvedTheme: resolved })
          applyThemeClass(resolved)
        } else {
          set({ currentUserId: userId })
          localStorage.setItem(getUserThemeKey(userId), get().theme)
        }
      },
    }),
    {
      name: 'mwpanel-theme',
      partialize: (state) => ({ theme: state.theme }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const resolved = resolveTheme(state.theme);
        useThemeStore.setState({ resolvedTheme: resolved });
        applyThemeClass(resolved);
      },
    }
  )
);

// Initialize on load
if (typeof window !== 'undefined') {
  const theme = useThemeStore.getState().theme;
  const resolved = resolveTheme(theme);
  applyThemeClass(resolved);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (useThemeStore.getState().theme === 'system') {
      const newResolved = e.matches ? 'dark' : 'light';
      useThemeStore.setState({ resolvedTheme: newResolved });
      applyThemeClass(newResolved);
    }
  });
}
