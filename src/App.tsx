import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SearchForm } from "./components/SearchForm.js";
import { HotelResults } from "./components/HotelResults.js";
const queryClient = new QueryClient();

const getScreenComponent = () => {
  switch (window.location.pathname) {
    case "/":
      return SearchForm;
    case "/results":
      return HotelResults;
    default:
      return SearchForm;
  }
};

export function App() {
  const ScreenComponent = getScreenComponent();

  return (
    <QueryClientProvider client={queryClient}>
      <ScreenComponent />
    </QueryClientProvider>
  );
}
