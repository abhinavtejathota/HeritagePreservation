import React, { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ReactComponent as MenuIcon } from "./Hamburg_icon.svg";
import { motion, animate } from "framer-motion";
import Sidebar from "./Sidebar";
import Ellora from "./images/Ellora.jpg"; //India
import Colosseum from "./images/Colosseum.jpg"; //Italy
import Giza from "./images/Giza.jpg"; //Egypt
import Alhambra from "./images/Alhambra.jpg"; //Spain
import Athens from "./images/Athens.jpg"; //Greece
import Carthage from "./images/Carthage.jpg"; //Tunisia
import Germany from "./images/Germany.jpg"; //Germany
import Temple from "./images/GreatTemple.jpg"; //Jordan
import Kilwa from "./images/Kilwa.jpg"; //Tanzania
import Leptis from "./images/Leptis.jpg"; //Libya
import Mapungubwe from "./images/Mapungubwe.jpg"; //South Africa
import Medina from "./images/Medina.jpg"; //Morocco
import Michel from "./images/Michel.jpg"; //France
import Mongan from "./images/Mongan.jpg"; //Ireland
import Stonehenge from "./images/Stonehenge.jpg"; //United Kingdom
import Tigray from "./images/Tigray.jpg"; //Ethiopia
import Timbuktu from "./images/Timbuktu.jpg"; //Mali
import Vienna from "./images/Vienna.jpg"; //Austria
import Wall from "./images/Wall.jpg"; //China
import Zimbabwe from "./images/Zimbabwe.jpg"; //Zimbabwe
import Prehistoric from "./images/Prehistoric.jpg"; //Prehistoric
import Ancient from "./images/Ancient.jpg"; //Ancient Empires
import Early from "./images/Early.jpg"; //Early Medieval
import High from "./images/High.jpg"; //High Medieval
import Late from "./images/Late.jpg"; //Late Medieval
import Modern from "./images/Modern.jpg"; //Early Modern
import Structure from "./images/Structure.jpg"; //Structure type
import Architecture from "./images/Architecture.jpg"; //Architecture style
import Era from "./images/Era.jpg"; //Era (Year)
import Civilization from "./images/Civilization.jpg"; //Civilization
import Religion from "./images/Religion.jpg"; //Religion
import Popularity from "./images/Popularity.jpg"; //Popularity
import Preservation from "./images/Preservation.jpg"; //Preservation status
import Continents from "./images/Continents.jpg"; //Continents
import Materials from "./images/Materials.jpg"; //Materials
import Wonders from "./images/Wonders.jpg"; //Wonders of the World
import Sacred from "./images/Sacred.jpg"; //Sacred places
import Lost from "./images/Lost.jpg"; //Lost cities
import Chapel from "./images/Chapel.jpg"; //Blue Chapel
import Naba from "./images/Naba.jpg"; //Nabataean Theatre
import Winged from "./images/Winged.jpg"; //Temple of Winged Lions
import DiscoverSearch from "../component/DiscoverSearch";
import MoodBrowse from "../component/MoodBrowse";
import SurpriseMe from "../component/SurpriseMe";
import { NAV_LINKS } from "../lib/navLinks";

const DashboardCard = ({ content, image, variant, queryKey }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (variant === "interact") {
      navigate(`/sites-list?name=${encodeURIComponent(content)}`);
      return;
    }

    if (variant === "featured") {
      navigate(
        `/sites-list?type=featured&value=${encodeURIComponent(queryKey)}`
      );
      return;
    }
    //To implement theme properly -> navigate to themes page
    if (variant === "theme") {
      navigate(`/themes?type=${queryKey}`);
      return;
    }

    navigate(
      `/sites-list?type=${variant}&value=${encodeURIComponent(content)}`
    );
  };

  const isFeatured = variant === "featured";
  const isInteract = variant === "interact";

  return (
    <div
      onClick={handleClick}
      className={`
				rounded-2xl overflow-hidden relative shadow-md group mt-3 cursor-grab
				transition-all duration-300 hover:-translate-y-4 hover:shadow-xl hover:z-30
				${isFeatured ? "w-[645px] h-[400px]" : "w-[200px] h-36"}
        ${isInteract ? "w-[645px] h-[400px]" : "w-[200px] h-36"}
			`}
    >
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
        style={{ backgroundImage: `url(${image})` }}
      ></div>
      <div className="absolute inset-0 bg-black/50"></div>
      <div className="absolute inset-0 flex items-center justify-center text-white text-center">
        <h3
          className={`font-bold ${isFeatured ? "text-4xl" : "text-md"} ${
            isInteract ? "text-4xl" : "text-md"
          }`}
        >
          {content}
        </h3>
      </div>
    </div>
  );
};

const DashboardCardsWrapper = ({ cards, variant }) => {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const isFeatured = variant === "featured";
  const isInteract = variant === "interact";
  const sliderRef = useRef(null);

  const updateScrollState = () => {
    const slider = sliderRef.current;
    if (!slider) return;

    setCanScrollLeft(slider.scrollLeft > 5);
    setCanScrollRight(
      slider.scrollLeft + slider.clientWidth < slider.scrollWidth - 5
    );
  };

  const scrollByAmount = (direction) => {
    const slider = sliderRef.current;
    if (!slider) return;

    const distance = isFeatured ? 600 : 260;

    animate(
      slider.scrollLeft,
      slider.scrollLeft + (direction === "right" ? distance : -distance),
      {
        duration: 0.6,
        ease: "easeOut",
        onUpdate: (latest) => {
          slider.scrollLeft = latest;
        },
      }
    );
  };

  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider) return;

    updateScrollState();

    slider.addEventListener("scroll", updateScrollState);
    return () => slider.removeEventListener("scroll", updateScrollState);
  }, []);

  return (
    <div className="relative w-full -mt-3">
      {canScrollLeft && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => scrollByAmount("left")}
          className={`absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full z-40 hover:bg-black/70 
            ${isFeatured ? "ms-20" : "ms-24"} ${
            isInteract ? "ms-20" : "ms-24"
          }`}
        >
          ‹
        </motion.button>
      )}

      <motion.div
        ref={sliderRef}
        drag="x"
        dragElastic={0.06}
        dragMomentum={true}
        whileTap={{ cursor: "grabbing" }}
        onDrag={(e, info) => {
          if (!sliderRef.current) return;
          sliderRef.current.scrollLeft -= info.delta.x;
        }}
        onDragEnd={updateScrollState}
        className={`flex overflow-x-hidden no-scrollbar rounded-2xl cursor-default
        ${
          isFeatured
            ? "h-[450px] ms-28 me-28 gap-2"
            : "h-[191px] ms-28 me-28 gap-3"
        }
       ${
         isInteract
           ? "h-[450px] ms-28 me-28 gap-2"
           : "h-[191px] ms-28 me-28 gap-3"
       }`}
      >
        {cards.map((card, index) => (
          <div key={index} className="p-1 shrink-0">
            <DashboardCard
              content={card.content}
              image={card.image}
              variant={variant}
              queryKey={card.key}
            />
          </div>
        ))}
      </motion.div>

      {canScrollRight && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => scrollByAmount("right")}
          className={`absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full z-40 hover:bg-black/70 
            ${isFeatured ? "me-20" : "me-24"} ${
            isInteract ? "me-20" : "me-24"
          }`}
        >
          ›
        </motion.button>
      )}
    </div>
  );
};

export default function Explore() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  //navigate(`/explore?${type}=${value}`)
  const loc = [
    { content: "India", image: Ellora },
    { content: "China", image: Wall },
    { content: "Jordan", image: Temple },
    { content: "Italy", image: Colosseum },
    { content: "Greece", image: Athens },
    { content: "United Kingdom", image: Stonehenge },
    { content: "France", image: Michel },
    { content: "Spain", image: Alhambra },
    { content: "Ireland", image: Mongan },
    { content: "Austria", image: Vienna },
    { content: "Germany", image: Germany },
    { content: "Zimbabwe", image: Zimbabwe },
    { content: "Egypt", image: Giza },
    { content: "Ethiopia", image: Tigray },
    { content: "Mali", image: Timbuktu },
    { content: "Tunisia", image: Carthage },
    { content: "Libya", image: Leptis },
    { content: "Morocco", image: Medina },
    { content: "Tanzania", image: Kilwa },
    { content: "South Africa", image: Mapungubwe },
  ];

  const era = [
    { content: "Prehistoric", image: Prehistoric },
    { content: "Ancient Empires", image: Ancient },
    { content: "Early Medieval", image: Early },
    { content: "High Medieval", image: High },
    { content: "Late Medieval", image: Late },
    { content: "Early Modern", image: Modern },
  ];

  const theme = [
    { content: "Architecture", image: Architecture, key: "architecture" },
    { content: "Era", image: Era, key: "era_category" },
    { content: "Civilization", image: Civilization, key: "civilization" },
    { content: "Continents", image: Continents, key: "continent" },
    { content: "Religion", image: Religion, key: "religion" },
    { content: "Materials", image: Materials, key: "material" },
    { content: "Structure", image: Structure, key: "structure" },
    { content: "Popularity", image: Popularity, key: "popularity_rank" },
    { content: "Preservation", image: Preservation, key: "preservation_rank" },
  ];

  const featured = [
    {
      key: "wonders_of_the_world",
      content: "Wonders of the World",
      image: Wonders,
    },
    { key: "sacred_spaces", content: "Sacred Spaces", image: Sacred },
    { key: "lost_cities", content: "Lost cities", image: Lost },
  ];

  const interact = [
    { content: "Blue Pillar Chapel", image: Chapel },
    { content: "Great Temple (Petra)", image: Temple },
    { content: "The Nabataean Theatre", image: Naba },
    { content: "Temple of the Winged Lions", image: Winged },
  ];

  const links = NAV_LINKS;

  return (
    <div className="flex flex-col min-h-screen">
      <nav className="fixed left-0 right-0 top-0 bg-white text-black px-6 py-4 flex justify-between items-center shadow z-50">
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

      <div className="flex flex-col gap-6 mt-20 text-left px-6 md:px-0">
        <div className="ms-0 md:ms-24 me-0 md:me-24 flex flex-col items-center text-center">
          <h1 className="text-3xl py-2 mb-2 font-sans font-bold">Discover</h1>
          <p className="text-stone-600 mb-4 max-w-2xl">
            Not sure where to start? Describe a place - or use a photo - and we will
            find heritage sites that feel the same.
          </p>
          <div className="w-full max-w-4xl">
            <DiscoverSearch />
          </div>
          <div className="mt-8 mb-4 w-full max-w-4xl text-left">
            <SurpriseMe />
          </div>
          <div className="w-full max-w-4xl text-left">
            <MoodBrowse />
          </div>
        </div>
        <h1 className="text-3xl py-2 mb-4 ms-24 font-sans font-bold">
          Categories
        </h1>
        <h1 className="text-xl ms-36 -mt-8 font-sans">Featured Collections</h1>
        <DashboardCardsWrapper cards={featured} variant="featured" />
        <h1 className="text-xl ms-36 -mt-8 font-sans">Explore by Time</h1>
        <DashboardCardsWrapper cards={era} variant="era_category" />
        <h1 className="text-xl ms-36 -mt-8 font-sans">Explore by Location</h1>
        <DashboardCardsWrapper cards={loc} variant="country" />
        {/*Have to implement theme properly*/}
        <h1 className="text-xl ms-36 -mt-8 font-sans">Explore by Theme</h1>
        <DashboardCardsWrapper cards={theme} variant="theme" />
        <h1 className="text-xl ms-36 -mt-8 font-sans">
          Interactive Experiences
        </h1>
        <DashboardCardsWrapper cards={interact} variant="interact" />
      </div>
    </div>
  );
}
