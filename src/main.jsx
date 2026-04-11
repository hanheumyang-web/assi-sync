import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext'
import PortfolioPublicPage from './components/portfolio/PortfolioPublicPage'
import DownloadPage from './components/DownloadPage'
import InstagramCallback from './components/InstagramCallback'
import ShareDownloadPage from './components/ShareDownloadPage'
import GuidePage from './components/GuidePage'
import ChatBot from './components/ChatBot'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/p/:slug" element={<PortfolioPublicPage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/share/:shareId" element={<ShareDownloadPage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/auth/instagram/callback" element={<InstagramCallback />} />
          <Route path="/*" element={<App />} />
        </Routes>
        <ChatBot />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
