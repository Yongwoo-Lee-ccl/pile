import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { PdfViewPage } from './pages/PdfViewPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/pdf/:id" element={<PdfViewPage />} />
    </Routes>
  );
}

export default App;