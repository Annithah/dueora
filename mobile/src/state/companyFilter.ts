import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { useSession } from '@/state/session';

const KEY = 'dueora.companyFilter';

interface CompanyFilterState {
  /** workspaceId → selected company id (missing = "All companies"). */
  byWorkspace: Record<string, string>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  select: (workspaceId: string, companyId: string | null) => void;
}

/**
 * The global company switcher (Home, Bills, Calendar, Reports), remembered on this device
 * per workspace. The server still decides what the user may see; this only narrows it.
 */
export const useCompanyFilter = create<CompanyFilterState>((set, get) => ({
  byWorkspace: {},
  hydrated: false,
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? (JSON.parse(raw) as unknown) : {};
      const byWorkspace =
        saved && typeof saved === 'object' && !Array.isArray(saved)
          ? Object.fromEntries(Object.entries(saved as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>
          : {};
      set({ byWorkspace, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  select: (workspaceId, companyId) => {
    const next = { ...get().byWorkspace };
    if (companyId) next[workspaceId] = companyId;
    else delete next[workspaceId];
    set({ byWorkspace: next });
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
  },
}));

/** The selected company in the active workspace, or undefined for "All companies". */
export function useSelectedCompanyId(): string | undefined {
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  return useCompanyFilter((s) => (workspaceId ? s.byWorkspace[workspaceId] : undefined));
}

export function useSelectCompany(): (companyId: string | null) => void {
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  const select = useCompanyFilter((s) => s.select);
  return (companyId) => {
    if (workspaceId) select(workspaceId, companyId);
  };
}
