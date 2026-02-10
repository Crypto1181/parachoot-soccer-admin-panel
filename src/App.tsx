import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminLayout from '@/layouts/AdminLayout';
import Dashboard from '@/pages/Dashboard';
import MatchManager from '@/pages/MatchManager';
import Login from '@/pages/Login';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="matches" element={<MatchManager />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
