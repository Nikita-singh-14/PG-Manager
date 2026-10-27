import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const toast = useCallback((message, isError = false) => {
    setT({ message, isError });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), 3200);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div id="toast" role="status" aria-live="polite" className={t ? `show${t.isError ? ' error' : ''}` : ''}>{t?.message}</div>
    </ToastContext.Provider>
  );
}
