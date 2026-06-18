import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { generateWallet, importWallet, signAuthMessage } from '../utils/crypto.js';
import { api, setAuthToken, clearAuthToken } from '../utils/api.js';

const WalletCtx = createContext(null);

const STORAGE_KEY = 'cp_wallet_v2';
const TOKEN_KEY   = 'cp_token_v1';

export function WalletProvider({ children }) {
  const [wallet,        setWallet]        = useState(null);
  const [balance,       setBalance]       = useState(0);
  const [reputation,    setReputation]    = useState(0);
  const [rewards,       setRewards]       = useState(0);
  const [role,          setRole]          = useState(null);
  const [department,    setDepartment]    = useState(null);  // Phase 14B
  const [city,          setCity]          = useState(null);  // Phase 14C
  const [token,         setToken]         = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [authLoading,   setAuthLoading]   = useState(false);
  const [error,         setError]         = useState(null);

  // ── Reload chain data ──────────────────────────────────────────────────────
  const refresh = useCallback(async (addr) => {
    if (!addr) return;
    try {
      const [b, r, rw] = await Promise.allSettled([
        api.balance(addr),
        api.profileReputation(addr),
        api.profilePoints(addr),
      ]);
      if (b.status  === 'fulfilled') setBalance(b.value.balance ?? 0);
      if (r.status  === 'fulfilled') setReputation(r.value.score ?? 0);
      if (rw.status === 'fulfilled') setRewards(rw.value.points ?? 0);
    } catch {}
  }, []);

  // ── Full auth flow: nonce → sign → login ───────────────────────────────────
  const authFlow = useCallback(async (w) => {
    if (!w?.privateKey || !w?.address) return null;
    setAuthLoading(true);
    try {
      // 1. Get nonce
      const { nonce } = await api.authNonce(w.address);

      // 2. Sign challenge
      const signature = await signAuthMessage(w.privateKey, w.address, nonce);

      // 3. Login
      const result = await api.authLogin({
        address:   w.address,
        publicKey: w.publicKey,
        nonce,
        signature,
      });

      // 4. Store token + role
      const { token: jwt, role: userRole } = result;
      localStorage.setItem(TOKEN_KEY, jwt);
      setAuthToken(jwt);
      setToken(jwt);
      setRole(userRole);
      setIsAuthenticated(true);

      // Phase 14B+14C: fetch department + city after auth
      try {
        const me = await api.myDepartment();
        setDepartment(me.department || null);
        setCity(me.city       || null);  // Phase 14C
      } catch { /* no jurisdiction assigned yet — fine */ }

      return result;
    } catch (e) {
      console.error('[useWallet] authFlow failed:', e.message);
      return null;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // ── Validate existing token with /api/auth/me ──────────────────────────────
  const validateToken = useCallback(async (savedToken, w) => {
    if (!savedToken) return false;
    setAuthToken(savedToken);
    try {
      const me = await api.authMe();
      setToken(savedToken);
      setRole(me.role);
      setIsAuthenticated(true);
      // Phase 14B+14C: also fetch department + city
      try {
        const me = await api.myDepartment();
        setDepartment(me.department || null);
        setCity(me.city       || null);  // Phase 14C
      } catch { /* dept not assigned yet */ }
      return true;
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      clearAuthToken();
      if (w) {
        const result = await authFlow(w);
        return !!result;
      }
      return false;
    }
  }, [authFlow]);

  // ── Restore from localStorage on mount ────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const saved      = localStorage.getItem(STORAGE_KEY);
        const savedToken = localStorage.getItem(TOKEN_KEY);
        if (!saved) return;
        const w = JSON.parse(saved);
        setWallet(w);
        refresh(w.address);
        // Validate existing token or re-auth silently
        await validateToken(savedToken, w);
      } catch {}
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-refresh balance/rep every 15s ────────────────────────────────────
  useEffect(() => {
    if (!wallet) return;
    const id = setInterval(() => refresh(wallet.address), 15_000);
    return () => clearInterval(id);
  }, [wallet, refresh]);

  // ── Connect ────────────────────────────────────────────────────────────────
  const connect = useCallback(async (mode, privateKey) => {
    setLoading(true);
    setError(null);
    try {
      const w = mode === 'import' ? await importWallet(privateKey) : await generateWallet();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
      setWallet(w);
      await refresh(w.address);
      // Run auth flow immediately after wallet connect
      await authFlow(w);
      return w;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [refresh, authFlow]);

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    clearAuthToken();
    setWallet(null);
    setToken(null);
    setRole(null);
    setDepartment(null); // Phase 14B
    setCity(null);       // Phase 14C
    setIsAuthenticated(false);
    setBalance(0);
    setReputation(0);
    setRewards(0);
  }, []);

  return (
    <WalletCtx.Provider value={{
      wallet, balance, reputation, rewards,
      role, department, city, token, isAuthenticated,
      loading, authLoading, error,
      connect, disconnect, refresh, authFlow,
    }}>
      {children}
    </WalletCtx.Provider>
  );
}

export const useWallet = () => useContext(WalletCtx);