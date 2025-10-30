const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseCSV } = require('../utils/csvParser');
const regattaService = require('../db/service');

// Set up file upload storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    
    // Create the uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Use a unique filename to avoid conflicts
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Create multer upload middleware
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB file size limit
  fileFilter: (req, file, cb) => {
    // Accept only CSV files
    if (path.extname(file.originalname).toLowerCase() === '.csv') {
      return cb(null, true);
    }
    cb(new Error('Only CSV files are allowed'));
  }
});

// Route to handle CSV file upload
router.post('/', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Parse the CSV file
    const filePath = req.file.path;
    const records = await parseCSV(filePath);
    
    if (records.length === 0) {
      return res.status(400).json({ 
        error: 'No valid records found in the CSV file',
        message: 'Please check the file format and try again'
      });
    }
    
    // Insert the records into the database
    const insertedRecords = await regattaService.insertBulkRecords(records);
    
    // Clean up the temporary file
    fs.unlinkSync(filePath);
    
    res.status(200).json({
      success: true,
      message: `Successfully uploaded and processed ${insertedRecords.length} records`,
      recordCount: insertedRecords.length
    });
  } catch (error) {
    console.error('Error processing CSV upload:', error);
    res.status(500).json({
      error: 'Error processing CSV file',
      message: error.message
    });
  }
});

// Add new route for clearing database
router.post('/clear', async (req, res) => {
  try {
    const result = await regattaService.clearDatabase();
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Database cleared successfully',
        recordsDeleted: result.recordsDeleted 
      });
    } else {
      throw new Error('Failed to clear database');
    }
  } catch (error) {
    console.error('Error clearing database:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clear database',
      message: error.message 
    });
  }
});

module.exports = router; 