const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDb } = require('./db/init');
const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chat');
const dataRoutes = require('./routes/data');
require('dotenv').config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database before starting server
const startServer = async () => {
  try {
    // Initialize the database
    const dbInitialized = await initDb();
    
    if (!dbInitialized) {
      console.error('Failed to initialize database. Exiting...');
      process.exit(1);
    }
    
    // API Routes
    app.use('/api/upload', uploadRoutes);
    app.use('/api/chat', chatRoutes);
    app.use('/api/data', dataRoutes);
    
    // Serve static files from the public directory
    // Upload page
    app.get('/upload', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'upload.html'));
    });
    
    // Chatbot page
    app.get('/chat', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'chat.html'));
    });
    
    // Data quality report page
    app.get('/report', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'report.html'));
    });
    
    // Home page (redirect to upload page)
    app.get('/', (req, res) => {
      res.redirect('/upload');
    });
    
    // Handle 404s
    app.use((req, res) => {
      res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    });
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Upload page: http://localhost:${PORT}/upload`);
      console.log(`Chat page: http://localhost:${PORT}/chat`);
      console.log(`Report page: http://localhost:${PORT}/report`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

// Start the server
startServer(); 