import React, { lazy, Suspense } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

import { Navigation } from "./components/Navigation";
import { ContactsPage } from "./pages/contacts";
import { HomePage } from "./pages/home";

import "./App.css";

const NCALayer = lazy(() => import("NCALayerApp/NCALayer"));

function App() {
  return (
    <div className="App">
      <Router>
        <Navigation />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route
            path="/nca-layer"
            element={
              <Suspense fallback={<div>Loading..</div>}>
                <NCALayer />
              </Suspense>
            }
          />
        </Routes>
      </Router>
    </div>
  );
}

export default App;
