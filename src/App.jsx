import React, { useState, useEffect } from "react";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { StudentList } from "./pages/StudentList";
import { BatchList } from "./pages/BatchList";
import { PaymentList } from "./pages/PaymentList";
import { SeatGrid } from "./pages/SeatGrid";
import { Attendance } from "./pages/Attendance";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";
import { Login } from "./pages/Login";

const App = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const loggedIn = sessionStorage.getItem("isLoggedIn");
    if (loggedIn === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  // Force dark theme on html root
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const handleLogin = () => {
    sessionStorage.setItem("isLoggedIn", "true");
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard onTabChange={setActiveTab} />;
      case "students":
        return <StudentList />;
      case "batches":
        return <BatchList />;
      case "payments":
        return <PaymentList />;
      case "seats":
        return <SeatGrid />;
      case "attendance":
        return <Attendance />;
      case "reports":
        return <Reports />;
      case "settings":
        return <Settings />;
      default:
        return <Dashboard onTabChange={setActiveTab} />;
    }
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </Layout>
  );
};

export default App;
