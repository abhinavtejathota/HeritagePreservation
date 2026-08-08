import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { ReactComponent as MenuIcon } from "./Hamburg_icon.svg";
import { getKidsMode, setKidsMode } from "../lib/prefs";

const Sidebar = ({ sidebarOpen, setSidebarOpen, links }) => {
  const [kids, setKids] = useState(() => getKidsMode());

  useEffect(() => {
    const onKids = (e) => setKids(!!e.detail?.on);
    window.addEventListener("vheritage:kids", onKids);
    return () => window.removeEventListener("vheritage:kids", onKids);
  }, []);

  return (
    <div
      className={`fixed left-0 top-0 z-[999] w-64 bg-white min-h-screen p-4 transform transition-transform duration-500 ease-in-out ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <nav className="flex flex-col gap-3">
        <div className="flex items-center mb-8 py-1">
          <button
            onClick={() => setSidebarOpen(false)}
            className="inline-flex items-center p-1 focus:outline-none"
          >
            <MenuIcon className="w-6 h-6 text-gray-800 hover:bg-gray-100 ms-1" />
          </button>
          <h1 className="text-xl font-sans ms-4">vHeritage Archive</h1>
        </div>
        <hr className="-mt-6 border-gray-200" />
        {links.map((link) => (
          <NavLink
            key={link.name}
            to={link.to}
            className="-mt-2 px-3 py-2 rounded hover:bg-gray-100 no-underline hover:underline transition-colors duration-300 ease-in-out"
            onClick={() => setSidebarOpen(false)}
          >
            {link.name}
          </NavLink>
        ))}
        <hr className="border-gray-200 my-2" />
        <label className="flex items-center gap-2 px-3 py-2 text-sm text-stone-700 cursor-pointer">
          <input
            type="checkbox"
            checked={kids}
            onChange={(e) => setKids(setKidsMode(e.target.checked))}
          />
          Kids mode
        </label>
        <p className="px-3 text-[11px] text-stone-400 leading-snug">
          Shorter answers and simpler puzzle help. Saved on this device only - no login.
        </p>
      </nav>
    </div>
  );
};

export default Sidebar;
