import { useState, useEffect } from 'react';
import { get, set, clear } from 'idb-keyval';
import { AccountToken } from '../types';

export function useAccountPersistence() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  
  const [accounts, setAccounts] = useState<AccountToken[]>([]);
  const [activeAccountIds, setActiveAccountIds] = useState<Set<string>>(new Set());
  
  const [customClientId, setCustomClientId] = useState('');
  const [isByokMode, setIsByokMode] = useState(false);

  useEffect(() => {
    const hydrateAccounts = async () => {
      try {
        setIsInitializing(true);
        setHydrationError(null);
        
        const storedAccounts = await get('matrix_accounts');
        const storedActiveIds = await get('matrix_active_ids');
        const storedByokId = await get('matrix_byok_client_id');
        
        if (storedByokId) {
          setCustomClientId(storedByokId);
          setIsByokMode(true);
        }

        if (storedAccounts && Array.isArray(storedAccounts) && storedAccounts.length > 0) {
          setAccounts(storedAccounts);
          if (storedActiveIds && Array.isArray(storedActiveIds)) {
            setActiveAccountIds(new Set(storedActiveIds));
          } else {
            setActiveAccountIds(new Set(storedAccounts.map((a: AccountToken) => a.id)));
          }
        }
      } catch (e: any) {
        console.error("Failed to hydrate accounts from local storage", e);
        setHydrationError(e.message || "Storage corrupted or inaccessible. Please sign in again.");
      } finally {
        setIsInitializing(false);
      }
    };
    
    hydrateAccounts();
  }, []);

  // Save to Local Storage when accounts change
  useEffect(() => {
    if (!isInitializing && !hydrationError) {
      set('matrix_accounts', accounts).catch(console.error);
    }
  }, [accounts, isInitializing, hydrationError]);

  useEffect(() => {
    if (!isInitializing && !hydrationError) {
      set('matrix_active_ids', Array.from(activeAccountIds)).catch(console.error);
    }
  }, [activeAccountIds, isInitializing, hydrationError]);

  useEffect(() => {
    if (!isInitializing && !hydrationError) {
      if (isByokMode && customClientId) {
        set('matrix_byok_client_id', customClientId).catch(console.error);
      } else {
        set('matrix_byok_client_id', '').catch(console.error);
      }
    }
  }, [isByokMode, customClientId, isInitializing, hydrationError]);

  const clearStorageAndReset = async () => {
    setAccounts([]);
    setActiveAccountIds(new Set());
    setIsByokMode(false);
    setCustomClientId('');
    setHydrationError(null);
    try {
      await clear();
      await set('matrix_accounts', []);
      await set('matrix_active_ids', []);
      await set('matrix_byok_client_id', '');
    } catch (e) {
      console.error("Error clearing storage", e);
    }
  };

  return {
    isInitializing,
    hydrationError,
    accounts,
    setAccounts,
    activeAccountIds,
    setActiveAccountIds,
    isByokMode,
    setIsByokMode,
    customClientId,
    setCustomClientId,
    clearStorageAndReset
  };
}
