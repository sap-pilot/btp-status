import { useEffect, useRef, useState } from 'react';

export interface AuthState {
  enabled: boolean;
  loggedIn: boolean;
  firstName: string;
  initials: string;
  isAdmin: boolean;
}

interface MeResponse {
  enabled?: boolean;
  loggedIn?: boolean;
  firstName?: string;
  initials?: string;
  isAdmin?: boolean;
}

interface AuthMessage {
  type: 'login' | 'logout' | 'login-error';
  user?: { firstName: string; initials: string; isAdmin: boolean };
}

const INITIAL: AuthState = { enabled: false, loggedIn: false, firstName: '', initials: '', isAdmin: false };

function fetchMe(): Promise<MeResponse> {
  return fetch('/api/me').then(r => r.json() as Promise<MeResponse>);
}

function watchPopup(w: Window, onClose: () => void): () => void {
  const timer = setInterval(() => { if (w.closed) { clearInterval(timer); onClose(); } }, 500);
  return () => clearInterval(timer);
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(INITIAL);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    fetchMe()
      .then(d => setAuth({ enabled: d.enabled ?? false, loggedIn: d.loggedIn ?? false, firstName: d.firstName ?? '', initials: d.initials ?? '', isAdmin: d.isAdmin ?? false }))
      .catch(() => null);

    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const msg = e.data as AuthMessage;
      if (msg.type === 'login' && msg.user) {
        setAuth(a => ({ ...a, loggedIn: true, firstName: msg.user!.firstName, initials: msg.user!.initials, isAdmin: msg.user!.isAdmin }));
        popupRef.current = null;
      } else if (msg.type === 'logout') {
        setAuth(a => ({ ...a, loggedIn: false, firstName: '', isAdmin: false }));
        popupRef.current = null;
      } else if (msg.type === 'login-error') {
        popupRef.current = null;
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function login() {
    if (popupRef.current && !popupRef.current.closed) { popupRef.current.focus(); return; }
    const w = window.open('/login', 'btpauth', 'width=600,height=700,left=200,top=100');
    popupRef.current = w;
    if (w) {
      // Fallback: postMessage may not fire if cross-origin navigation through XSUAA drops window.opener
      watchPopup(w, () => {
        if (popupRef.current === w) popupRef.current = null;
        fetchMe()
          .then(d => setAuth({ enabled: d.enabled ?? false, loggedIn: d.loggedIn ?? false, firstName: d.firstName ?? '', initials: d.initials ?? '', isAdmin: d.isAdmin ?? false }))
          .catch(() => null);
      });
    }
  }

  function logout() {
    if (popupRef.current && !popupRef.current.closed) { popupRef.current.focus(); return; }
    const w = window.open('/logout', 'btpauth', 'width=600,height=400,left=200,top=100');
    popupRef.current = w;
    if (w) {
      // Fallback: ensure logged-out state even if postMessage was missed during XSUAA redirect chain
      watchPopup(w, () => {
        if (popupRef.current === w) popupRef.current = null;
        setAuth(a => ({ ...a, loggedIn: false, firstName: '', isAdmin: false }));
      });
    }
  }

  return { ...auth, login, logout };
}
