import { useState } from 'react';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { FileSearch, MoveUpRight } from 'lucide-react';
import ApplicationPage from './pages/ApplicationPage';
import ResumeBuilderPage from './pages/ResumeBuilderPage';
import type { Profile } from './application';

function Workspace() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const { pathname } = useLocation();
  return <>
    <header className="site-header">
      <div className="header-inner">
        <Link to="/" className="brand"><span><FileSearch size={20} /></span> Resume AI</Link>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>Compare</NavLink>
          <NavLink to="/resume-builder">Resume Builder <MoveUpRight size={14} /></NavLink>
        </nav>
      </div>
    </header>
    <main>
      <div hidden={pathname !== '/'}><ApplicationPage onProfile={setProfile} onClear={() => setProfile(null)} /></div>
      <Routes>
        <Route path="/" element={null} />
        <Route path="/resume-builder" element={<ResumeBuilderPage profile={profile} onProfile={setProfile} />} />
        <Route path="/privacy" element={<div className="workspace privacy"><h1>Privacy</h1><p>Live analysis sends the resume and vacancy to the configured backend and its model provider. The app does not write these documents or reports to storage. Clear the workspace to remove them from this session. Downloaded profiles and printed copies are managed on your device.</p></div>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
    <footer className="site-footer"><span>Resume AI</span><Link to="/privacy">Privacy</Link></footer>
  </>;
}

export default function App() {
  return <BrowserRouter><Workspace /></BrowserRouter>;
}
