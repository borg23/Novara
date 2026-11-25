import { createRoot } from "react-dom/client";
import App from "./shell";
import "@/app/globals.css";

createRoot(document.getElementById("root")!).render(<App />);
