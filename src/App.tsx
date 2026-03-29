import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';

const Layout = lazy(() => import('./components/Layout'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Pipeline = lazy(() => import('./pages/Pipeline'));
const ContactDetail = lazy(() => import('./pages/ContactDetail'));
const CalendarPage = lazy(() => import('./pages/Calendar'));
const FieldTools = lazy(() => import('./pages/FieldTools'));
const More = lazy(() => import('./pages/More'));
const Team = lazy(() => import('./pages/Team'));
const Reports = lazy(() => import('./pages/Reports'));
const CompanyProfile = lazy(() => import('./pages/CompanyProfile'));
const WorkOrders = lazy(() => import('./pages/WorkOrders'));
const Estimates = lazy(() => import('./pages/Estimates'));
const CrewSchedule = lazy(() => import('./pages/CrewSchedule'));
const MaterialOrders = lazy(() => import('./pages/MaterialOrders'));
const WorkOrderDetail = lazy(() => import('./pages/WorkOrderDetail'));
const EstimateDetail = lazy(() => import('./pages/EstimateDetail'));
const EstimateSigner = lazy(() => import('./pages/EstimateSigner'));
const Documents = lazy(() => import('./pages/Documents'));
const PhotoChecklist = lazy(() => import('./pages/PhotoChecklist'));
const Settings = lazy(() => import('./pages/Settings'));
const HelpSupport = lazy(() => import('./pages/HelpSupport'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Login = lazy(() => import('./pages/Login'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const DocumentManager = lazy(() => import('./pages/DocumentManager'));
const DocumentSigner = lazy(() => import('./pages/DocumentSigner'));
const DocumentViewer = lazy(() => import('./pages/DocumentViewer'));
const ReportBuilder = lazy(() => import('./pages/ReportBuilder'));
const RetailEstimator = lazy(() => import('./pages/RetailEstimator'));
const SmartInspection = lazy(() => import('./pages/SmartInspection'));
const PitchGauge = lazy(() => import('./pages/PitchGauge'));
const DocumentTemplateEditor = lazy(() => import('./pages/DocumentTemplateEditor'));
const ContactFieldTools = lazy(() => import('./pages/ContactFieldTools'));
const PublicDocumentSigner = lazy(() => import('./pages/PublicDocumentSigner'));
const InspectionReportBuilder = lazy(() => import('./pages/InspectionReportBuilder'));

function AppLoadingScreen({ message }: { message: string }) {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent border-t-transparent mb-4"></div>
      <p className="text-slate-500 text-sm font-medium animate-pulse">{message}</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-8 text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-slate-600 transition-colors"
      >
        Taking too long? Tap to reload
      </button>
    </div>
  );
}

function AppRoutes() {
  const { session, loading, profile, isRecoverySession } = useAuth();

  // Hide the native splash screen once auth has finished initialising.
  // autoHide is false in capacitor.config.ts so the splash stays up until
  // the JS is actually ready — preventing the blank white flash on slow
  // simulator / device cold starts.
  useEffect(() => {
    if (!loading) {
      SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {
        // Web/browser — SplashScreen plugin not available, ignore.
      });
    }
  }, [loading]);

  if (loading) {
    // On native: return null — the native splash screen covers this gap.
    // Showing a light in-app spinner here makes it look like the splash never ends.
    if (Capacitor.isNativePlatform()) return null;
    // On web only: show the spinner (no native splash to cover startup).
    return <AppLoadingScreen message="Initializing application..." />;
  }

  // Show change-password screen for temp-password users or Supabase recovery links
  const mustChangePassword = session && (
    (profile as any)?.must_change_password === true || isRecoverySession
  );

  return (
    <Suspense fallback={<AppLoadingScreen message="Loading screen..." />}>
      <Routes>
        {/* Always-accessible routes — work with or without a session */}
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* Public e-signature page — homeowners open this in their browser, no auth needed */}
        <Route path="/sign/:token" element={<PublicDocumentSigner />} />
        {!session ? (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/contacts" element={<Pipeline />} />
            <Route path="/contacts/:id" element={<ContactDetail />} />

            {/* Contact sub-routes */}
            <Route path="/contacts/:id/tools" element={<ContactFieldTools />} />
            <Route path="/contacts/:id/inspection-report" element={<InspectionReportBuilder />} />
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
            <Route path="/photo-checklist" element={<PhotoChecklist />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/document-templates" element={<DocumentTemplateEditor />} />
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

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const hideSplash = () => {
      SplashScreen.hide().catch(() => {
        // Ignore duplicate or unsupported calls outside the native shell.
      });
    };

    const frameId = window.requestAnimationFrame(() => {
      window.setTimeout(hideSplash, 100);
    });
    const fallbackId = window.setTimeout(hideSplash, 1500);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(fallbackId);
    };
  }, []);

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
