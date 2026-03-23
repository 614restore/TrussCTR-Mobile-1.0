import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import ContactDetail from './pages/ContactDetail';
import CalendarPage from './pages/Calendar';
import FieldTools from './pages/FieldTools';
import More from './pages/More';
import Team from './pages/Team';
import Reports from './pages/Reports';
import CompanyProfile from './pages/CompanyProfile';
import WorkOrders from './pages/WorkOrders';
import Estimates from './pages/Estimates';
import CrewSchedule from './pages/CrewSchedule';
import MaterialOrders from './pages/MaterialOrders';
import WorkOrderDetail from './pages/WorkOrderDetail';
import EstimateDetail from './pages/EstimateDetail';
import EstimateSigner from './pages/EstimateSigner';
import Documents from './pages/Documents';
import PhotoChecklist from './pages/PhotoChecklist';
import Settings from './pages/Settings';
import HelpSupport from './pages/HelpSupport';
import Notifications from './pages/Notifications';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import AcceptInvite from './pages/AcceptInvite';
import DocumentManager from './pages/DocumentManager';
import DocumentSigner from './pages/DocumentSigner';
import DocumentViewer from './pages/DocumentViewer';
import ReportBuilder from './pages/ReportBuilder';
import RetailEstimator from './pages/RetailEstimator';
import SmartInspection from './pages/SmartInspection';
import PitchGauge from './pages/PitchGauge';
import { AuthProvider, useAuth } from './context/AuthContext';

function AppRoutes() {
  const { session, loading } = useAuth();

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

  return (
    <Routes>
      {/* Always-accessible routes — work with or without a session */}
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
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
          <Route path="/help" element={<HelpSupport />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/pitch-gauge" element={<PitchGauge />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
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
