import { createRoot } from "react-dom/client";
import { SearchForm } from "../components/SearchForm.js";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<SearchForm />);
}
