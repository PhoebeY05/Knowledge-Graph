import { BrowserRouter, Route, Routes } from "react-router-dom";

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { AppSidebar } from "./components/AppSidebar";
import GraphPage from "./pages/GraphPage";
import UploadPage from "./pages/UploadPage";

function App() {
  return (
    <BrowserRouter>
      <SidebarProvider>
        <div className="flex w-full">
          <AppSidebar />
          <SidebarInset className="flex-1">

            {/* ...existing content wrapper... */}
            <div className="flex justify-center">
              {/* constrained, responsive content area that will be centered */}
              <Routes>
                <Route path="/" element={<UploadPage />} />
                <Route path="/graph/:title" element={<GraphPage />} />
              </Routes>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </BrowserRouter>
  );
}

export default App;
