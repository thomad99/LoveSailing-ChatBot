const fs = require('fs');
const csv = require('csv-parser');

// Function to parse CSV file and convert it to structured data
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        // Map CSV columns to database fields
        // Normalize column names to handle different CSV formats
        const record = normalizeRecord(data);
        if (record) {
          results.push(record);
        }
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

// Function to normalize record fields from CSV to match database schema
const normalizeRecord = (data) => {
  // Create a lowercase mapping of the actual CSV headers
  const headers = {};
  for (const key in data) {
    headers[key.toLowerCase()] = key;
  }

  // Try to extract the needed fields from the CSV using various possible column names
  const record = {
    regatta_name: extractField(data, headers, ['regatta name', 'regatta', 'event name', 'event', 'regatta_name']),
    regatta_date: parseDate(extractField(data, headers, ['regatta date', 'date', 'event date', 'regatta_date'])),
    category: extractField(data, headers, ['category', 'class', 'boat class', 'division']),
    position: parseInt(extractField(data, headers, ['position', 'place', 'rank', 'finish'])) || null,
    sail_number: extractField(data, headers, ['sail number', 'sail #', 'sail', 'number', 'sail_number']),
    boat_name: extractField(data, headers, ['boat name', 'boat', 'vessel', 'boat_name']),
    skipper: extractField(data, headers, ['skipper', 'sailor', 'racer', 'person', 'competitor', 'name', 'kid', 'adult']),
    yacht_club: extractField(data, headers, ['yacht club', 'club', 'team', 'organization', 'yacht_club']),
    results: extractField(data, headers, ['results', 'races', 'race results', 'scores']),
    total_points: parseFloat(extractField(data, headers, ['total points', 'points', 'score', 'total', 'total_points'])) || null
  };

  // For debugging
  console.log('Extracted record:', record);

  // Ensure we have at least the required fields
  if (!record.regatta_name && !record.skipper) {
    console.warn('Skipping record due to missing both required fields:', data);
    return null;
  }

  // If yacht_club is empty but we have other required fields, let's not skip
  if (record.regatta_name && record.skipper) {
    if (!record.yacht_club) {
      record.yacht_club = "Unknown"; // Set a default value
    }
    return record;
  }

  console.warn('Skipping record due to missing required fields:', data);
  return null;
};

// Helper to extract a field from various possible column names
const extractField = (data, headers, possibleNames) => {
  for (const name of possibleNames) {
    // Check if column exists directly (case-sensitive)
    if (data[name] !== undefined) {
      return data[name];
    }
    
    // Check if column exists in lowercase mapping (case-insensitive)
    const headerKey = headers[name];
    if (headerKey && data[headerKey] !== undefined) {
      return data[headerKey];
    }
    
    // Try checking exact keys without lowercase conversion
    for (const key in data) {
      if (key.toLowerCase() === name.toLowerCase()) {
        return data[key];
      }
    }
  }
  return null;
};

// Parse various date formats to standard ISO format
const parseDate = (dateString) => {
  if (!dateString) return null;
  
  // Try to parse the date
  const date = new Date(dateString);
  
  // Check if the date is valid
  if (isNaN(date.getTime())) {
    // Handle common formats like MM/DD/YYYY
    const parts = dateString.split(/[\/\-\.]/);
    if (parts.length === 3) {
      // Assume MM/DD/YYYY
      const month = parseInt(parts[0]) - 1;
      const day = parseInt(parts[1]);
      let year = parseInt(parts[2]);
      
      // Handle 2-digit years
      if (year < 100) {
        year += year < 50 ? 2000 : 1900;
      }
      
      const newDate = new Date(year, month, day);
      if (!isNaN(newDate.getTime())) {
        return newDate.toISOString().split('T')[0];
      }
    }
    
    return null;
  }
  
  // Return just the date part in ISO format
  return date.toISOString().split('T')[0];
};

module.exports = {
  parseCSV
}; 