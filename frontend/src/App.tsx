import { BrowserRouter, Route, Routes } from "react-router-dom";

import GraphPage from "./GraphPage";
import UploadPage from "./UploadPage";

function App() {
  return (
    <BrowserRouter>
      <div className="flex justify-center">
        {/* constrained, responsive content area that will be centered */}
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/graph/:title" element={<GraphPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
