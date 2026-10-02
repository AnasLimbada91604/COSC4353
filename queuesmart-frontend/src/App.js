import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import AdminDashboard from "./pages/AdminDashboard";
import History from "./pages/History";
import Login from "./pages/Login";
import QueueStatus from "./pages/QueueStatus";
import Register from "./pages/Register";
import QueueManagment from "./pages/QueueManagement";
import ServiceManagement from "./pages/ServiceManagement";

function App() {
  return (
    <BrowserRouter>
      <nav>
        <NavLink to="/login">Login</NavLink>
        <NavLink to="/register">Register</NavLink>
        <NavLink to="/admin">Admin Dashboard</NavLink>
        <NavLink to="/queue-status">Queue Status</NavLink>
        <NavLink to="/history">History</NavLink>
        <NavLink to="/queue-management">Queue Management</NavLink>
        <NavLink to="/service-management">Service Management</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/queue-status" element={<QueueStatus />} />
        <Route path="/history" element={<History />} />
        <Route path="/queue-management" element={<QueueManagment />} />
        <Route path="/service-management" element={<ServiceManagement />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
