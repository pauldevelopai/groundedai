import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext.jsx';
import { apiFetch } from '../hooks/useApi.js';

const SectorContext = createContext(null);

export function SectorProvider({ children }) {
  const { user } = useAuth();
  const [sectors, setSectors] = useState([]);
  const [selectedSectorId, setSelectedSectorId] = useState(
    () => localStorage.getItem('holly_sector_id') || null
  );

  useEffect(() => {
    if (!user) return;
    apiFetch('/sectors')
      .then(data => setSectors(data || []))
      .catch(() => setSectors([]));
  }, [user]);

  function selectSector(id) {
    setSelectedSectorId(id);
    if (id) {
      localStorage.setItem('holly_sector_id', id);
    } else {
      localStorage.removeItem('holly_sector_id');
    }
  }

  function refreshSectors() {
    return apiFetch('/sectors').then(data => setSectors(data || []));
  }

  const selectedSector = sectors.find(s => s.id === selectedSectorId) || null;

  return (
    <SectorContext.Provider value={{ sectors, selectedSectorId, setSelectedSectorId: selectSector, selectedSector, refreshSectors }}>
      {children}
    </SectorContext.Provider>
  );
}

export function useSectors() {
  const ctx = useContext(SectorContext);
  if (!ctx) throw new Error('useSectors must be used within SectorProvider');
  return ctx;
}
