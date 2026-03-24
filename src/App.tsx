import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';

// Auth pages loaded eagerly — they're tiny and needed before the bundle resolves
import Login from './pages/Login';

// Every other page is lazy-loaded so the initial JS bundle stays small.
// iOS parses only the login/auth chunk on cold start; route chunks load on demand.
const Dashboard        = lazy(() => import('./pages/Dashboard'));
const Pipeline         = lazy(() => import('./pages/Pipeline'));
const ContactDetail    = lazy(() => import('./pages/ContactDetail'));
const CalendarPage     = lazy(() => import('./pages/Calendar'));
const FieldTools       = lazy(() => import('./pages/FieldTools'));
const More             = lazy(() => import('./pages/More'));
const Team             = lazy(() => import('./pages/Team'));
const Reports          = lazy(() => import('./pages/Reports'));
const CompanyProfile   = lazy(() => import('./pages/CompanyProfile'));
const WorkOrders       = lazy(() => import('./pages/WorkOrders'));
const Estimates        = lazy(() => import('./pages/Estimates'));
const CrewSchedule     = lazy(() => import('./pages/CrewSchedule'));
const MaterialOrders   = lazy(() => import('./pages/MaterialOrders'));
const WorkOrderDetail  = lazy(() => import('./pages/WorkOrderDetail'));
const EstimateDetail   = lazy(() => import('./pages/EstimateDetail'));
const EstimateSigner   = lazy(() => import('./pages/EstimateSigner'));
const Documents        = lazy(() => import('./pages/Documents'));
const PhotoChecklist   = lazy(() => import('./pages/PhotoChecklist'));
const Settings         = lazy(() => import('./pages/Settings'));
const HelpSupport      = lazy(() => import('./pages/HelpSupport'));
const Notifications    = lazy(() => import('./pages/Notifications'));
const ResetPassword    = lazy(() => import('./pages/ResetPassword'));
const AcceptInvite     = lazy(() => import('./pages/AcceptInvite'));
const DocumentManager  = lazy(() => import('./pages/DocumentManager'));
const DocumentSigner   = lazy(() => import('./pages/DocumentSigner'));
const DocumentViewer   = lazy(() => import('./pages/DocumentViewer'));
const ReportBuilder    = lazy(() => import('./pages/ReportBuilder'));
const RetailEstimator  = lazy(() => import('./pages/RetailEstimator'));
const SmartInspection  = lazy(() => import('./pages/SmartInspection'));
const PitchGauge       = lazy(() => import('./pages/PitchGauge'));

const PageLoader = () => (
  <div className="h-screen flex items-center justify-center bg-slate-50">
    <div className="animate-spin rounded-full h-10 w-10 border-4 border-accent border-t-transparent" />
  </div>
);

function AppRoutes() {
  const { session, loading, profile, isRecoverySession } = useAuth();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {});
    }
  }, [loading]);

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent border-t-transparent mb-4"></div>
        <p className="text-slate-500 text-sm font-medium animate-pulse">Initializing application...</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-8 text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-slate-600 transition-colors"
        >
          Taking too long? Tap to reload
        </button>
      </div>
    );
  }

  const mustChangePassword = session && (
    (profile as any)?.must_change_password === true || isRecoverySession
  );

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/accept-invite" element={<AcceptInvite />} />
        {!session ? (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : mustChangePassword ? (
          <>
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="*" element={<Navigate to="/reset-password" replace />} />
          </>
        ) : (
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/contacts" element={<Pipeline />} />
            <Route path="/contacts/:id" element={<ContactDetail />} />

            {/* Contact sub-routes */}
            <Route path="/contacts/:id/documents" element={<DocumentManager />} />
            <Route path="/contacts/:id/documents/:docType" element={<DocumentSigner />} />
            <Route path="/documents/view/:documentId" element={<DocumentViewer />} />
            <Route path="/contacts/:id/report" element={<ReportBuilder />} />
            <Route path="/contacts/:id/estimate" element={<RetailEstimator />} />
            <Route path="/contacts/:id/inspection" element={<SmartInspection />} />

            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/tools" element={<FieldTools />} />
            <Route path="/more" element={<More />} />
            <Route path="/team" element={<Team />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/company" element={<CompanyProfile />} />
            <Route path="/work-orders" element={<WorkOrders />} />
            <Route path="/estimates-list" element={<Estimates />} />
            <Route path="/crew-schedule" element={<CrewSchedule />} />
            <Route path="/material-orders" element={<MaterialOrders />} />
            <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
            <Route path="/estimates/:id" element={<EstimateDetail />} />
            <Route path="/estimates/:id/sign" element={<EstimateSigner />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/contacts/:id/photo-checklist" element={<PhotoChecklist />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/help" element={<HelpSupport />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/pitch-gauge" element={<PitchGauge />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </Suspense>
  );
}

export default function App() {
  const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;

  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
