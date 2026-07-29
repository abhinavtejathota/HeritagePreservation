import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Sidebar from "../Dashboard/Sidebar.js";
import { ReactComponent as MenuIcon } from "../Dashboard/Hamburg_icon.svg";
import { NavLink } from "react-router-dom";

const API_BASE = process.env.REACT_APP_API_URL;

export default function Themes() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [values, setValues] = useState([]);
  const [loading, setLoading] = useState(true);

  const links = [
    { name: "Home", to: "/" },
    { name: "Explore", to: "/Explore" },
    { name: "Nearby", to: "/Nearby" },
    { name: "Favourites", to: "/Favourites" },
    { name: "Play", to: "/Play" },
  ];

  const params = new URLSearchParams(location.search);
  const type = params.get("type");

  useEffect(() => {
    if (!type) return;

    const fetchValues = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/themes/${type}`);
        const data = await res.json();
        setValues(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchValues();
  }, [type]);

  const formatTitle = (str) =>
    str?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex flex-col min-h-screen">
      <nav className="fixed left-0 right-0 top-0 bg-white text-black px-6 py-4 flex justify-between items-center shadow">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex flex-col justify-between w-6 h-6"
          >
            <MenuIcon className="w-6 h-6" />
          </button>
          <a href="/">
            <h1 className="text-xl font-sans">vHeritage Archive</h1>
          </a>
        </div>

        <div className="hidden md:flex gap-4">
          {links.map((link) => (
            <NavLink
              key={link.name}
              to={link.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded hover:bg-gray-100 no-underline hover:underline transition-colors duration-300 ease-in-out`
              }
            >
              {link.name}
            </NavLink>
          ))}
        </div>
      </nav>

      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        links={links}
      />
      <div className="px-24 pt-24">
        <h1 className="text-3xl font-bold mb-8">{formatTitle(type)}</h1>

        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-700" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {values.map((item, index) => (
              <motion.div
                key={item.content}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                onClick={() =>
                  navigate(
                    `/sites-list?type=${type}&value=${encodeURIComponent(
                      item.content
                    )}&rank=${item.key}`
                  )
                }
                className="cursor-pointer px-6 py-4 rounded-lg
                         bg-gray-50 hover:bg-gray-100
                         transition shadow-sm"
              >
                <h2 className="text-lg font-semibold">{item.content}</h2>
                {item.count && (
                  <p className="text-sm text-gray-500">{item.count} sites</p>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
