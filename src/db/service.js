const { pool } = require('./init');

class RegattaService {
  // Insert a single record
  async insertRecord(record) {
    console.log('Attempting to insert record:', record);
    
    // Set default values for missing but required fields
    if (!record.yacht_club || record.yacht_club === '') {
      record.yacht_club = 'Unknown';
    }
    
    const query = `
      INSERT INTO RegattaNetworkData (
        regatta_name, regatta_date, category, position, 
        sail_number, boat_name, skipper, yacht_club, 
        results, total_points
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const values = [
      record.regatta_name,
      record.regatta_date,
      record.category,
      record.position,
      record.sail_number,
      record.boat_name,
      record.skipper,
      record.yacht_club,
      record.results,
      record.total_points
    ];
    
    try {
      const result = await pool.query(query, values);
      console.log('Successfully inserted record:', result.rows[0]);
      return result.rows[0];
    } catch (error) {
      console.error('Error inserting record:', error);
      console.error('Failed values:', values);
      throw error;
    }
  }
  
  // Insert multiple records (for CSV uploads)
  async insertBulkRecords(records) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const insertedRecords = [];
      for (const record of records) {
        const result = await this.insertRecord(record);
        insertedRecords.push(result);
      }
      
      await client.query('COMMIT');
      return insertedRecords;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error inserting bulk records:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Get all records
  async getAllRecords() {
    try {
      const result = await pool.query('SELECT * FROM RegattaNetworkData ORDER BY regatta_date DESC');
      return result.rows;
    } catch (error) {
      console.error('Error fetching all records:', error);
      throw error;
    }
  }
  
  // Search records by various criteria
  async searchRecords(criteria) {
    let query = 'SELECT * FROM RegattaNetworkData WHERE 1=1';
    const values = [];
    let valueIndex = 1;
    
    if (criteria.skipper) {
      // Enhanced skipper name search with strict matching
      const skipperName = criteria.skipper.trim();
      
      // Create conditions for exact matches with higher priority
      let nameConditions = [];
      
      // Exact match conditions (case sensitive and insensitive)
      nameConditions.push(`skipper = $${valueIndex}`); 
      values.push(skipperName);
      valueIndex++;
      
      nameConditions.push(`LOWER(skipper) = LOWER($${valueIndex})`);
      values.push(skipperName);
      valueIndex++;
      
      // Starts with exact first name/last name
      nameConditions.push(`skipper ILIKE $${valueIndex}`);
      values.push(`${skipperName}%`);
      valueIndex++;
      
      // Also check boat_name for exact matches
      nameConditions.push(`boat_name = $${valueIndex}`); 
      values.push(skipperName);
      valueIndex++;
      
      nameConditions.push(`LOWER(boat_name) = LOWER($${valueIndex})`);
      values.push(skipperName);
      valueIndex++;
      
      // Only as a fallback, allow partial matches within the name
      nameConditions.push(`skipper ILIKE $${valueIndex}`);
      values.push(`%${skipperName}%`);  
      valueIndex++;
      
      nameConditions.push(`boat_name ILIKE $${valueIndex}`);
      values.push(`%${skipperName}%`);
      valueIndex++;
      
      query += ` AND (${nameConditions.join(' OR ')})`;
      
      // Order by exact match first, then partial matches
      query += ` ORDER BY 
                CASE WHEN skipper = '${skipperName}' THEN 0
                    WHEN LOWER(skipper) = LOWER('${skipperName}') THEN 1
                    WHEN boat_name = '${skipperName}' THEN 2
                    WHEN LOWER(boat_name) = LOWER('${skipperName}') THEN 3
                    WHEN skipper ILIKE '${skipperName}%' THEN 4
                    WHEN LOWER(skipper) LIKE LOWER('%${skipperName}%') THEN 5
                    WHEN LOWER(boat_name) LIKE LOWER('%${skipperName}%') THEN 6
                    ELSE 7
                END, regatta_date DESC`;
    } else {
      // Other search criteria - keep as is
      if (criteria.boat_name) {
        query += ` AND boat_name ILIKE $${valueIndex}`;
        values.push(`%${criteria.boat_name}%`);
        valueIndex++;
      }
      
      if (criteria.yacht_club) {
        query += ` AND yacht_club ILIKE $${valueIndex}`;
        values.push(`%${criteria.yacht_club}%`);
        valueIndex++;
      }
      
      if (criteria.regatta_name) {
        query += ` AND regatta_name ILIKE $${valueIndex}`;
        values.push(`%${criteria.regatta_name}%`);
        valueIndex++;
      }
      
      if (criteria.year) {
        query += ` AND EXTRACT(YEAR FROM regatta_date) = $${valueIndex}`;
        values.push(criteria.year);
        valueIndex++;
      }
      
      // Default ordering
      query += ` ORDER BY regatta_date DESC, position ASC`;
    }
    
    // Add limit for non-sailor searches to avoid too many results
    if (!query.includes('LIMIT') && !criteria.skipper) {
      query += ' LIMIT 100';
    }
    
    console.log('Search query:', query);
    console.log('Search values:', values);
    
    try {
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Error searching records:', error);
      throw error;
    }
  }
  
  // Get top performers from a club
  async getTopSailors(yachtClub, limit = 10) {
    const query = `
      SELECT skipper, yacht_club, COUNT(*) as race_count, 
             AVG(position) as avg_position, MIN(position) as best_position
      FROM RegattaNetworkData
      WHERE yacht_club ILIKE $1
      GROUP BY skipper, yacht_club
      ORDER BY avg_position ASC
      LIMIT $2
    `;
    
    try {
      const result = await pool.query(query, [`%${yachtClub}%`, limit]);
      return result.rows;
    } catch (error) {
      console.error('Error getting top sailors:', error);
      throw error;
    }
  }
  
  // Get regatta results
  async getRegattaResults(regattaName) {
    const query = `
      SELECT * FROM RegattaNetworkData
      WHERE regatta_name ILIKE $1
      ORDER BY position ASC
    `;
    
    try {
      const result = await pool.query(query, [`%${regattaName}%`]);
      return result.rows;
    } catch (error) {
      console.error('Error getting regatta results:', error);
      throw error;
    }
  }
  
  // Get database stats
  async getDatabaseStats() {
    const query = `
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT skipper) as total_sailors,
        COUNT(DISTINCT regatta_name) as total_regattas,
        COUNT(DISTINCT yacht_club) as total_clubs,
        MIN(regatta_date) as earliest_date,
        MAX(regatta_date) as latest_date,
        (SELECT COUNT(*) FROM RegattaNetworkData 
         WHERE boat_name ~ '[A-Z][a-z]+ [A-Z][a-z]+' 
         AND boat_name NOT IN (SELECT boat_name FROM RegattaNetworkData WHERE boat_name = skipper)) 
         as potential_name_mismatches
      FROM RegattaNetworkData
    `;
    
    try {
      const result = await pool.query(query);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting database stats:', error);
      throw error;
    }
  }
  
  // Get regatta counts by year
  async getRegattaCountByYear(year) {
    const query = `
      SELECT regatta_name, regatta_date, COUNT(DISTINCT skipper) as participant_count
      FROM RegattaNetworkData
      WHERE EXTRACT(YEAR FROM regatta_date) = $1
      GROUP BY regatta_name, regatta_date
      ORDER BY regatta_date ASC
    `;
    
    try {
      const result = await pool.query(query, [year]);
      return result.rows;
    } catch (error) {
      console.error('Error getting regatta count by year:', error);
      throw error;
    }
  }
}

module.exports = new RegattaService(); 