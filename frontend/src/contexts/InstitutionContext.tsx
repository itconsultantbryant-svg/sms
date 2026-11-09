import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { InstitutionContext as InstitutionContextType } from '../types';

interface InstitutionContextValue {
  selectedInstitution: InstitutionContextType | null;
  setSelectedInstitution: (institution: InstitutionContextType | null) => void;
  clearInstitution: () => void;
}

const InstitutionContext = createContext<InstitutionContextValue | undefined>(undefined);

const STORAGE_KEY = 'svl_selected_institution';

export function InstitutionProvider({ children }: { children: ReactNode }) {
  const [selectedInstitution, setSelectedInstitutionState] = useState<InstitutionContextType | null>(null);

  // Load persisted institution on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const institution = JSON.parse(stored);
        setSelectedInstitutionState(institution);
      } catch (error) {
        console.error('Failed to parse stored institution:', error);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const setSelectedInstitution = (institution: InstitutionContextType | null) => {
    setSelectedInstitutionState(institution);
    if (institution) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(institution));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    window.dispatchEvent(new Event('svl:institution-changed'));
  };

  const clearInstitution = () => {
    setSelectedInstitutionState(null);
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('svl:institution-changed'));
  };

  return (
    <InstitutionContext.Provider value={{ selectedInstitution, setSelectedInstitution, clearInstitution }}>
      {children}
    </InstitutionContext.Provider>
  );
}

export function useInstitution() {
  const context = useContext(InstitutionContext);
  if (!context) {
    throw new Error('useInstitution must be used within InstitutionProvider');
  }
  return context;
}
