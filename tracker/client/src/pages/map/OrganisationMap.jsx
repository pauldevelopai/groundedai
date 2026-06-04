import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import 'leaflet/dist/leaflet.css';

// AI implementation strength → colour
function getStrengthColor(org) {
  // Calculate strength from: has policy, has framework, has security, mentorship active, learning progress
  let score = 0;
  if (org.has_policy) score += 2;
  if (org.has_framework) score += 2;
  if (org.has_security) score += 1;
  if (org.has_mentorship) score += 2;
  if (org.learning_progress > 50) score += 2;
  else if (org.learning_progress > 0) score += 1;
  if (org.relationship_stage === 'active') score += 1;

  // 0-2: red (just starting), 3-5: orange (in progress), 6-8: green (strong), 9+: blue (excellent)
  if (score >= 9) return '#2563EB'; // blue — excellent
  if (score >= 6) return '#10B981'; // green — strong
  if (score >= 3) return '#F59E0B'; // orange — in progress
  return '#EF4444'; // red — just starting
}

function getStrengthLabel(org) {
  const color = getStrengthColor(org);
  if (color === '#2563EB') return 'Excellent';
  if (color === '#10B981') return 'Strong';
  if (color === '#F59E0B') return 'In Progress';
  return 'Just Starting';
}

// Auto-fit map to markers
function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = positions.map(p => [p.lat, p.lng]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 });
    }
  }, [positions, map]);
  return null;
}

export default function OrganisationMap() {
  const navigate = useNavigate();
  const { selectedSectorId } = useSectors();
  const [orgs, setOrgs] = useState([]);

  useEffect(() => {
    apiFetch(buildUrl('/organisations/map', selectedSectorId)).then(setOrgs).catch(() => setOrgs([]));
  }, [selectedSectorId]);

  const mappable = orgs.filter(o => o.latitude && o.longitude);
  const positions = mappable.map(o => ({ lat: parseFloat(o.latitude), lng: parseFloat(o.longitude) }));

  return (
    <div>
      <PageHeader title="Organisation Map" />
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
        All organisations on the map, coloured by AI implementation strength.
      </p>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 12 }}>
        {[
          { color: '#EF4444', label: 'Just Starting' },
          { color: '#F59E0B', label: 'In Progress' },
          { color: '#10B981', label: 'Strong' },
          { color: '#2563EB', label: 'Excellent' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: l.color, border: '2px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            <span>{l.label}</span>
          </div>
        ))}
        <span style={{ color: 'var(--text-secondary)' }}>({mappable.length} of {orgs.length} orgs on map)</span>
      </div>

      {/* Map */}
      <div style={{ height: 600, borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
        <MapContainer center={[0, 20]} zoom={2} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {positions.length > 0 && <FitBounds positions={positions} />}
          {mappable.map(org => (
            <CircleMarker
              key={org.id}
              center={[parseFloat(org.latitude), parseFloat(org.longitude)]}
              radius={org.type === 'foundation' ? 12 : 8}
              fillColor={getStrengthColor(org)}
              fillOpacity={0.85}
              color="white"
              weight={2}
              eventHandlers={{ click: () => navigate(`/organisations/${org.id}`) }}
            >
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{org.name}</div>
                  {org.programme_name && <div style={{ fontSize: 11, color: '#6366F1', marginBottom: 4 }}>{org.programme_name}</div>}
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{org.type} · {org.country || '—'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: getStrengthColor(org) }} />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{getStrengthLabel(org)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#888' }}>
                    {org.has_policy && '✓ Policy '}
                    {org.has_framework && '✓ Framework '}
                    {org.has_security && '✓ Security '}
                    {org.has_mentorship && '✓ Mentorship '}
                    {org.learning_progress > 0 && `✓ Learning ${org.learning_progress}% `}
                  </div>
                  {org.contact_count > 0 && <div style={{ fontSize: 11, marginTop: 4 }}>{org.contact_count} contacts</div>}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
