import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectors } from '../../context/SectorContext.jsx';
import { apiFetch, buildUrl } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import DataTable from '../../components/DataTable.jsx';
import SectorBadge from '../../components/SectorBadge.jsx';
import AiBadge from '../../components/AiBadge.jsx';
import CourseForm from './CourseForm.jsx';
import CurriculumIntelligence from './CurriculumIntelligence.jsx';

const STATUS_LABELS = { draft: 'Draft', active: 'Active', archived: 'Archived' };

export default function CoursesList() {
  const navigate = useNavigate();
  const { selectedSectorId } = useSectors();
  const [courses, setCourses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState('courses');

  function load() {
    apiFetch(buildUrl('/courses', selectedSectorId)).then(setCourses).catch(() => setCourses([]));
  }

  useEffect(load, [selectedSectorId]);

  const columns = [
    { key: 'title', label: 'Title', render: row => <span style={{ fontWeight: 500 }}>{row.title}</span> },
    { key: 'sector_name', label: 'Sector', render: row => <SectorBadge name={row.sector_name} colour={row.sector_colour} /> },
    { key: 'delivery_type', label: 'Delivery', render: row => row.delivery_type.replace('_', '-') },
    { key: 'version', label: 'Version' },
    { key: 'status', label: 'Status', render: row => (
      <span className={`stage-badge status-${row.status}`}>{STATUS_LABELS[row.status] || row.status}</span>
    )},
    { key: 'effectiveness_score', label: 'Effectiveness', render: row => row.effectiveness_score ? `${row.effectiveness_score}/5` : '—' },
    { key: 'module_count', label: 'Modules', render: row => row.module_count || 0 },
  ];

  return (
    <div>
      <PageHeader title="Curriculum Library">
        {activeTab === 'courses' && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Course</button>
        )}
      </PageHeader>

      <div className="tabs">
        <button className={`tab ${activeTab === 'courses' ? 'active' : ''}`} onClick={() => setActiveTab('courses')}>
          Courses ({courses.length})
        </button>
        <button className={`tab ${activeTab === 'intelligence' ? 'active' : ''}`} onClick={() => setActiveTab('intelligence')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Intelligence <AiBadge />
        </button>
      </div>

      {activeTab === 'courses' && (
        <DataTable
          columns={columns}
          data={courses}
          onRowClick={row => navigate(`/curriculum/${row.id}`)}
          emptyMessage="No courses yet. Add your first course to start building your curriculum."
        />
      )}

      {activeTab === 'intelligence' && <CurriculumIntelligence />}

      {showForm && <CourseForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </div>
  );
}
