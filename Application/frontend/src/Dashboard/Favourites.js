import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { ReactComponent as MenuIcon } from './Hamburg_icon.svg';
import Sidebar from "./Sidebar";

export default function Favourites() {
	const [sidebarOpen, setSidebarOpen] = useState(false);
	
  const links = [
    { name: "Home", to: "/" }, 
    { name: "Explore", to: "/Explore" },		
    { name: "Nearby", to: "/Nearby" },		
    { name: "Favourites", to: "/Favourites" },	
	{ name: "Play", to: "/Play" }			
  ];
	
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
						<h1 className="text-xl font-sans">
							vHeritage Archive
						</h1>
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
			
			<div>
				
			</div>
		</div>
	);
}