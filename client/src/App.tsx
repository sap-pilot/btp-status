import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Overview from '@/pages/Overview';
import History from '@/pages/History';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/overview" element={<Overview />} />
        <Route path="/history/:name" element={<History />} />
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
