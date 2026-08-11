import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/caveat/latin-500.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/fraunces/latin-400.css";
import "@fontsource/fraunces/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/newsreader/latin-400.css";
import "@fontsource/newsreader/latin-400-italic.css";
import PoetryApp from "../app/PoetryApp";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("De appcontainer ontbreekt.");

createRoot(root).render(
  <StrictMode>
    <PoetryApp />
  </StrictMode>,
);
