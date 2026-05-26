import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { SectorProvider } from './context/SectorContext.jsx';
import { AiAssistantProvider } from './context/AiAssistantContext.jsx';
import { useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';

// Redirects non-admin users to /lawsuits for all admin-only routes
function AdminRoute() {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/lawsuits" replace />;
  return <Outlet />;
}
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ContactsList from './pages/contacts/ContactsList.jsx';
import ContactDetail from './pages/contacts/ContactDetail.jsx';
import OrganisationsList from './pages/organisations/OrganisationsList.jsx';
import OrganisationDetail from './pages/organisations/OrganisationDetail.jsx';
import CohortsList from './pages/programmes/CohortsList.jsx';
import CohortDetail from './pages/programmes/CohortDetail.jsx';
import AssessmentsList from './pages/assessments/AssessmentsList.jsx';
import AssessmentDetail from './pages/assessments/AssessmentDetail.jsx';
import SectorSettings from './pages/settings/SectorSettings.jsx';
import TeamSettings from './pages/settings/TeamSettings.jsx';
import AssessmentQuestions from './pages/settings/AssessmentQuestions.jsx';
import CoursesList from './pages/curriculum/CoursesList.jsx';
import CourseDetail from './pages/curriculum/CourseDetail.jsx';
import DocumentsList from './pages/documents/DocumentsList.jsx';
import DocumentGenerate from './pages/documents/DocumentGenerate.jsx';
import DocumentDetail from './pages/documents/DocumentDetail.jsx';
import DocumentTemplates from './pages/settings/DocumentTemplates.jsx';
import ServicesList from './pages/services/ServicesList.jsx';
import EngagementDetail from './pages/services/EngagementDetail.jsx';
import CampaignsList from './pages/marketing/CampaignsList.jsx';
import CampaignDetail from './pages/marketing/CampaignDetail.jsx';
import SocialContent from './pages/marketing/SocialContent.jsx';
import GmailSettings from './pages/settings/GmailSettings.jsx';
import PipelineView from './pages/fundraising/PipelineView.jsx';
import FundersList from './pages/fundraising/FundersList.jsx';
import FunderDetail from './pages/fundraising/FunderDetail.jsx';
import OpportunityDetail from './pages/fundraising/OpportunityDetail.jsx';
import BackgroundJobs from './pages/settings/BackgroundJobs.jsx';
import IntelligenceList from './pages/intelligence/IntelligenceList.jsx';
import KnowledgeBase from './pages/knowledge/KnowledgeBase.jsx';
import NewsletterDigest from './pages/newsletter/NewsletterDigest.jsx';
import DatabaseEditor from './pages/database/DatabaseEditor.jsx';
import LearningDashboard from './pages/learning/LearningDashboard.jsx';
import JourneyDetail from './pages/learning/JourneyDetail.jsx';
import ParticipantPortal from './pages/portal/ParticipantPortal.jsx';
import CurriculumBuilderAgent from './pages/agents/CurriculumBuilderAgent.jsx';
import LeadFinderAgent from './pages/agents/LeadFinderAgent.jsx';
import ImplementationCoachAgent from './pages/agents/ImplementationCoachAgent.jsx';
import FeedbackList from './pages/feedback/FeedbackList.jsx';
import TrainingMaterials from './pages/curriculum/TrainingMaterials.jsx';
import LeadsPage from './pages/leads/LeadsPage.jsx';
import MentoringPage from './pages/mentoring/MentoringPage.jsx';
import OrganisationMap from './pages/map/OrganisationMap.jsx';
import LawsuitTracker from './pages/lawsuits/LawsuitTracker.jsx';
import RegulationTracker from './pages/regulations/RegulationTracker.jsx';
import LegalSourcesPage from './pages/legal-sources/LegalSourcesPage.jsx';
import UseCasesAdmin from './pages/usecases/UseCasesAdmin.jsx';
import { lazy, Suspense } from 'react';
import PublicLayout from './pages/public/PublicLayout.jsx';
import PublicHome from './pages/public/PublicHome.jsx';
import PublicLawsuitsList from './pages/public/PublicLawsuitsList.jsx';
import PublicLawsuitDetail from './pages/public/PublicLawsuitDetail.jsx';
import PublicRegulationsList from './pages/public/PublicRegulationsList.jsx';
import PublicRegulationDetail from './pages/public/PublicRegulationDetail.jsx';
// Code-split these — not on the critical path. Especially PublicExplore which
// pulls in react-force-graph-2d + d3-force (~300KB gzipped on its own).
const PublicExplore  = lazy(() => import('./pages/public/PublicExplore.jsx'));
const PublicSources  = lazy(() => import('./pages/public/PublicSources.jsx'));
const PublicSubmit   = lazy(() => import('./pages/public/PublicSubmit.jsx'));
const PublicUseCases = lazy(() => import('./pages/public/PublicUseCases.jsx'));

function LazyFallback() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SectorProvider>
        <AiAssistantProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/portal" element={<ParticipantPortal />} />

          {/* ── Public AI Legal site (ailegal.co.za) — no auth required ── */}
          <Route path="/legal" element={<PublicLayout />}>
            <Route index element={<PublicHome />} />
            <Route path="lawsuits" element={<PublicLawsuitsList />} />
            <Route path="lawsuits/:id" element={<PublicLawsuitDetail />} />
            <Route path="regulations" element={<PublicRegulationsList />} />
            <Route path="regulations/:id" element={<PublicRegulationDetail />} />
            <Route path="explore"        element={<Suspense fallback={<LazyFallback />}><PublicExplore /></Suspense>} />
            <Route path="sources"        element={<Suspense fallback={<LazyFallback />}><PublicSources /></Suspense>} />
            <Route path="submit"         element={<Suspense fallback={<LazyFallback />}><PublicSubmit /></Suspense>} />
            <Route path="use-cases"      element={<Suspense fallback={<LazyFallback />}><PublicUseCases mode="list" /></Suspense>} />
            <Route path="use-cases/:id"  element={<Suspense fallback={<LazyFallback />}><PublicUseCases mode="detail" /></Suspense>} />
            {/* Old path, now rolled into /legal/sources */}
            <Route path="transparency" element={<Navigate to="/legal/sources" replace />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>

              {/* ── Available to all authenticated users ── */}
              <Route path="/lawsuits" element={<LawsuitTracker />} />
              <Route path="/regulation-tracker" element={<RegulationTracker />} />
              <Route path="/legal-sources" element={<LegalSourcesPage />} />
              <Route path="/use-cases-admin" element={<UseCasesAdmin />} />

              {/* ── Admin-only routes — non-admins are redirected to /lawsuits ── */}
              <Route element={<AdminRoute />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/contacts" element={<ContactsList />} />
                <Route path="/contacts/:id" element={<ContactDetail />} />
                <Route path="/organisations" element={<OrganisationsList />} />
                <Route path="/organisations/:id" element={<OrganisationDetail />} />
                <Route path="/map" element={<OrganisationMap />} />
                <Route path="/programmes" element={<CohortsList />} />
                <Route path="/programmes/:id" element={<CohortDetail />} />
                <Route path="/assessments" element={<AssessmentsList />} />
                <Route path="/assessments/:id" element={<AssessmentDetail />} />
                <Route path="/training-materials" element={<TrainingMaterials />} />
                <Route path="/course-builder" element={<CurriculumBuilderAgent />} />
                <Route path="/curriculum" element={<CoursesList />} />
                <Route path="/curriculum/:id" element={<CourseDetail />} />
                <Route path="/documents" element={<DocumentsList />} />
                <Route path="/documents/new" element={<DocumentGenerate />} />
                <Route path="/documents/:id" element={<DocumentDetail />} />
                <Route path="/mentoring" element={<MentoringPage />} />
                <Route path="/services" element={<ServicesList />} />
                <Route path="/services/:id" element={<EngagementDetail />} />
                <Route path="/marketing/campaigns" element={<CampaignsList />} />
                <Route path="/marketing/campaigns/:id" element={<CampaignDetail />} />
                <Route path="/marketing/social" element={<SocialContent />} />
                <Route path="/leads" element={<LeadsPage />} />
                <Route path="/fundraising" element={<PipelineView />} />
                <Route path="/fundraising/funders" element={<FundersList />} />
                <Route path="/fundraising/funders/:id" element={<FunderDetail />} />
                <Route path="/fundraising/opportunities/:id" element={<OpportunityDetail />} />
                <Route path="/settings/sectors" element={<SectorSettings />} />
                <Route path="/settings/team" element={<TeamSettings />} />
                <Route path="/settings/gmail" element={<GmailSettings />} />
                <Route path="/settings/jobs" element={<BackgroundJobs />} />
                <Route path="/intelligence" element={<IntelligenceList />} />
                <Route path="/knowledge" element={<KnowledgeBase />} />
                <Route path="/newsletter" element={<NewsletterDigest />} />
                <Route path="/database" element={<DatabaseEditor />} />
                <Route path="/learning" element={<LearningDashboard />} />
                <Route path="/learning/:contactId" element={<JourneyDetail />} />
                <Route path="/agents" element={<BackgroundJobs />} />
                <Route path="/agents/curriculum" element={<CurriculumBuilderAgent />} />
                <Route path="/agents/leads" element={<LeadFinderAgent />} />
                <Route path="/agents/coach" element={<ImplementationCoachAgent />} />
                <Route path="/feedback" element={<FeedbackList />} />
              </Route>

            </Route>
          </Route>
        </Routes>
        </AiAssistantProvider>
      </SectorProvider>
    </AuthProvider>
  );
}
