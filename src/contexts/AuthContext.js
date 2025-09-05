import React, { createContext, useContext, useEffect, useState } from "react";
import { initUserDataClient, userDataClient } from "../lib/supabase";
import { clearAndroidWidget } from "../lib/widgetHelper";
import { supakeyIntegration } from "../lib/supakeyIntegration";
import { ensureSampleData } from "../lib/sampleData";

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    const setupAuth = async () => {
      const tokens = supakeyIntegration.getHasuAppTokens();
      const cfg = supakeyIntegration.getStoredUserDatabaseConfig();

      if (!tokens || !cfg) {
        if (isMounted) {
          setUser(null);
          setLoading(false);
          setLoadingMessage("");
        }
        return;
      }

      try {
        setLoadingMessage("Initializing session...");
        // If a client already exists (e.g., StrictMode remount), adopt it instead of re-initializing
        if (!userDataClient) {
          await initUserDataClient(
            cfg.supabaseUrl,
            tokens.jwt,
            tokens.refreshToken,
            null,
            cfg.anonKey || null
          );
        }
        // Verify we have a valid authenticated user before proceeding
        try {
          const { data: userRes, error: userErr } = await userDataClient.auth.getUser();
          if (userErr || !userRes?.user) {
            throw new Error('Invalid or expired session');
          }
        } catch (e) {
          throw e;
        }
        // Keep tokens fresh in storage when Supabase rotates them
        try {
          const { data: { subscription } } = userDataClient.auth.onAuthStateChange((event, session) => {
            if (!session) return;
            if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
              const newJwt = session.access_token;
              const newRefresh = session.refresh_token;
              if (newJwt && newRefresh) {
                const existing = supakeyIntegration.getHasuAppTokens() || {};
                const cfg2 = supakeyIntegration.getStoredUserDatabaseConfig() || {};
                supakeyIntegration.saveTokens({ ...existing, jwt: newJwt, refreshToken: newRefresh }, cfg2);
                console.log('🔄 Stored tokens updated after refresh');
              }
            } else if (event === 'SIGNED_OUT') {
              supakeyIntegration.clearStoredTokens();
              if (isMounted) {
                setUser(null);
                setLoading(false);
                setLoadingMessage("");
              }
            }
          })
          // Clean up on unmount
          if (subscription && typeof subscription.unsubscribe === 'function') {
            // attach to instance for cleanup
            AuthProvider.__authSub = subscription;
          }
        } catch (e) {
          console.warn('Auth state subscription setup failed:', e);
        }
      } catch (error) {
        console.error("Failed to initialize user data client:", error);
        supakeyIntegration.clearStoredTokens();
        if (isMounted) {
          setUser(null);
          setLoading(false);
          setLoadingMessage("");
        }
        return;
      }

      // Build user from active auth user when available
      let mockUser = { id: tokens.userId || tokens.username, email: tokens.email || (tokens.username ? `${tokens.username}@supakey.com` : null) };
      try {
        const { data: userRes } = await userDataClient.auth.getUser();
        if (userRes?.user) {
          mockUser = { id: userRes.user.id, email: userRes.user.email || mockUser.email };
        }
      } catch {}

      setLoadingMessage("Preparing your workspace...");
      await ensureSampleData(mockUser.id);

      if (isMounted) {
        setUser(mockUser);
        setLoading(false);
        setLoadingMessage("");
      }
    };

    setupAuth();
    return () => {
      isMounted = false;
      try {
        if (AuthProvider.__authSub) {
          AuthProvider.__authSub.unsubscribe();
          AuthProvider.__authSub = null;
        }
      } catch {}
    };
  }, []);

  const signOut = async () => {
    try {
      supakeyIntegration.clearStoredTokens();
      try {
        if (typeof sessionStorage !== "undefined") sessionStorage.clear();
      } catch {}
      try {
        if (typeof localStorage !== "undefined") localStorage.clear();
      } catch {}
      await clearAndroidWidget();
      setUser(null);
      return { error: null };
    } catch (error) {
      console.error("Error signing out:", error);
      return { error };
    }
  };

  const value = { user, loading, loadingMessage, signOut };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
