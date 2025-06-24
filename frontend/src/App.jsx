import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import Home from '../src/Pages/home'; // Fix path and ensure case matches

function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen">
        {/* Navigation Bar */}
        <nav className="bg-blue-600 text-white p-4 shadow-md">
          <div className="container mx-auto flex justify-between items-center">
            <Link to="/" className="text-2xl font-bold">DataEng-Automata</Link>
            <div className="space-x-4">
              <Link to="/" className="hover:underline">Home</Link>
              {/* Add more nav links later, e.g., Datasets, Logs, etc. */}
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Home />} />
            {/* Add more routes here as needed */}
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-gray-800 text-white text-center p-4">
          <p>© 2025 DataEng-Automata. All rights reserved.</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;