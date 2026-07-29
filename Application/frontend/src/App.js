import "./App.css";
import Dashboard from "./Dashboard/Dashboard";
import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Explore from "./Dashboard/Explore";
import Favourites from "./Dashboard/Favourites";
import Nearby from "./Dashboard/Nearby";
import Play from "./Dashboard/Play";
import Continent from "./pages/Continent";
import Sites from "./pages/Sites";
import SitesList from "./pages/SitesList";
import Chatbot from "./component/Chatbot";
import Themes from "./pages/Themes";

function App() {
  useEffect(() => {
    const blockRightClick = (e) => {
      e.preventDefault();
      console.log("Right click blocked!");
    };

    document.addEventListener("contextmenu", blockRightClick);

    return () => {
      document.removeEventListener("contextmenu", blockRightClick);
    };
  }, []);

  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/Explore" element={<Explore />} />
        <Route path="/Favourites" element={<Favourites />} />
        <Route path="/Nearby" element={<Nearby />} />
        <Route path="/Play" element={<Play />} />
        <Route path="/continent/:name" element={<Continent />} />
        <Route path="/sites/:name" element={<Sites />} />
        <Route path="/sites-list" element={<SitesList />} />
        <Route path="/themes" element={<Themes />}></Route>
      </Routes>

      <Chatbot />
    </div>
  );
}

export default App;
