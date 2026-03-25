import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User, Profile, Agency, UserRole, UserStatus } from '../types'
import { apiFetch, apiJsonFetch } from '../utils/apiClient'

type LoginResponse = {
  token: string
  expiresInSeconds: number
  user: User
  profile: Profile | null
  agency: Agency | null
}

type MeResponse = {
  user: User
  profile: Profile | null
  agency: Agency | null
}

interface AuthState {
  token: string | null
  user: User | null
  profile: Profile | null
  agency: Agency | null
  isAuthenticated: boolean
  
  // Actions
  setUser: (user: User | null) => void
  setProfile: (profile: Profile | null) => void
  setAgency: (agency: Agency | null) => void
  setToken: (token: string | null) => void
  login: (email: string, password: string) => Promise<void>
  register: (input: { email: string; password: string; firstName: string; lastName: string }) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => boolean
  refreshSession: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      profile: null,
      agency: null,
      isAuthenticated: false,

      setUser: (user) => set((state) => ({ user, isAuthenticated: !!user && !!state.token })),
      
      setProfile: (profile) => set({ profile }),
      
      setAgency: (agency) => set({ agency }),

      setToken: (token) => set((state) => ({ token, isAuthenticated: !!token && !!state.user })),

      login: async (email, password) => {
        const payload = await apiJsonFetch<LoginResponse>('/auth/login', {
          method: 'POST',
        }, {
          email: email.trim().toLowerCase(),
          password,
        })

        if (payload.user.status !== UserStatus.ACTIVE) {
          throw new Error('Konto nie jest aktywne')
        }

        set({
          token: payload.token,
          user: payload.user,
          profile: payload.profile,
          agency: payload.agency,
          isAuthenticated: true
        })
      },

      register: async ({ email, password, firstName, lastName }) => {
        const payload = await apiJsonFetch<LoginResponse>('/auth/register', {
          method: 'POST',
        }, {
          email: email.trim().toLowerCase(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        })

        if (payload.user.status !== UserStatus.ACTIVE) {
          throw new Error('Konto nie jest aktywne')
        }

        set({
          token: payload.token,
          user: payload.user,
          profile: payload.profile,
          agency: payload.agency,
          isAuthenticated: true,
        })
      },

      logout: async () => {
        set({
          token: null,
          user: null,
          profile: null,
          agency: null,
          isAuthenticated: false
        })
      },

      checkAuth: () => {
        const { token, user } = get()
        const isValid = !!token && !!user && user.status === UserStatus.ACTIVE
        if (isValid !== get().isAuthenticated) {
          set({ isAuthenticated: isValid })
        }
        return isValid
      },

      refreshSession: async () => {
        const { token } = get()
        if (!token) {
          set({
            user: null,
            profile: null,
            agency: null,
            isAuthenticated: false,
          })
          return
        }
        try {
          const payload = await apiFetch<MeResponse>('/auth/me')
          set({
            user: payload.user,
            profile: payload.profile,
            agency: payload.agency,
            isAuthenticated: payload.user.status === UserStatus.ACTIVE,
          })
        } catch (_error) {
          set({
            token: null,
            user: null,
            profile: null,
            agency: null,
            isAuthenticated: false,
          })
        }
      },
    }),
    {
      name: 'mwpanel-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        profile: state.profile,
        agency: state.agency,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)