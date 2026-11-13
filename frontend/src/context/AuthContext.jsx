import { useEffect, useMemo, useState } from 'react';
import { getCurrentUser, logoutUser as requestLogout } from '../services/api';
import { AuthContext } from './authContextValue';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      try {
        const response = await getCurrentUser();
        setUser(response.data.user);
      } catch (error) {
        setUser(null);
        if (error.response?.status !== 401) {
          console.error('Unable to restore the FitSense session:', error.message);
        }
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  const login = ({ user }) => {
    setUser(user);
  };

  const updateUser = (updatedUser) => setUser(updatedUser);

  const clearSession = () => setUser(null);

  const logout = async () => {
    try {
      await requestLogout();
    } finally {
      clearSession();
    }
  };

  const value = useMemo(() => ({ user, loading, login, updateUser, clearSession, logout }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
