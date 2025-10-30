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
    // First try exact match
    const exactQuery = `
      SELECT 
        position,
        skipper,
        yacht_club,
        boat_name,
        sail_number,
        results,
        total_points,
        regatta_date,
        category,
        regatta_name
      FROM RegattaNetworkData
      WHERE LOWER(regatta_name) = LOWER($1)
      ORDER BY 
        CASE 
          WHEN position ~ '^[0-9]+$' THEN CAST(position AS INTEGER)
          ELSE 999999
        END ASC,
        position ASC
    `;

    try {
      // Try exact match first
      const exactResult = await pool.query(exactQuery, [regattaName]);
      
      if (exactResult.rows.length > 0) {
        return exactResult.rows;
      }
      
      // If no exact match, try fuzzy match
      const fuzzyQuery = `
        SELECT 
          position,
          skipper,
          yacht_club,
          boat_name,
          sail_number,
          results,
          total_points,
          regatta_date,
          category,
          regatta_name
        FROM RegattaNetworkData
        WHERE LOWER(regatta_name) LIKE LOWER($1)
        ORDER BY 
          CASE 
            WHEN position ~ '^[0-9]+$' THEN CAST(position AS INTEGER)
            ELSE 999999
          END ASC,
          position ASC
      `;
      
      const fuzzyResult = await pool.query(fuzzyQuery, [`%${regattaName}%`]);
      
      if (fuzzyResult.rows.length === 0) {
        console.log('No results found for regatta:', regattaName);
      }
      
      return fuzzyResult.rows;
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

  // Clear all records from the database
  async clearDatabase() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get the count of records before deletion
      const countResult = await client.query('SELECT COUNT(*) FROM RegattaNetworkData');
      const recordCount = parseInt(countResult.rows[0].count);
      
      // Delete all records
      await client.query('TRUNCATE TABLE RegattaNetworkData RESTART IDENTITY');
      
      await client.query('COMMIT');
      
      return {
        success: true,
        recordsDeleted: recordCount
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error clearing database:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Get all skippers from a club
  async getClubSkippers(clubName) {
    const query = `
      SELECT DISTINCT 
        skipper,
        yacht_club,
        COUNT(*) as total_races,
        AVG(CASE 
          WHEN position ~ '^[0-9]+$' THEN CAST(position AS INTEGER)
          WHEN position IS NULL THEN NULL
          ELSE NULL
        END) as avg_position,
        COUNT(CASE 
          WHEN position ~ '^[0-9]+$' AND CAST(position AS INTEGER) <= 3 THEN 1
          ELSE NULL
        END) as podium_finishes,
        MIN(CASE 
          WHEN position ~ '^[0-9]+$' THEN CAST(position AS INTEGER)
          WHEN position IS NULL THEN NULL
          ELSE NULL
        END) as best_position,
        MAX(regatta_date) as last_race_date
      FROM RegattaNetworkData
      WHERE 
        yacht_club ILIKE $1 
        OR yacht_club ILIKE $2
        OR yacht_club ILIKE $3
        OR yacht_club ILIKE $4
      GROUP BY skipper, yacht_club
      ORDER BY 
        total_races DESC,
        avg_position ASC NULLS LAST
    `;

    try {
      // Handle common abbreviations and variations
      const result = await pool.query(query, [
        `%${clubName}%`,                    // Partial match
        `%${clubName.toUpperCase()}%`,      // Uppercase variation
        `%${clubName.toLowerCase()}%`,      // Lowercase variation
        `%${clubName.replace(/\s+/g, '')}%` // No spaces variation
      ]);

      if (result.rows.length === 0) {
        console.log('No skippers found for club:', clubName);
      }

      return result.rows;
    } catch (error) {
      console.error('Error getting club skippers:', error);
      throw error;
    }
  }

  // Get detailed data quality report for potential name mismatches
  async getDataQualityReport(limit = 100) {
    try {
      // Get summary statistics
      const summaryQuery = `
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT skipper) as total_sailors,
          COUNT(DISTINCT regatta_name) as total_regattas,
          COUNT(DISTINCT yacht_club) as total_clubs,
          (SELECT COUNT(*) FROM RegattaNetworkData 
           WHERE boat_name ~ '[A-Z][a-z]+ [A-Z][a-z]+' 
           AND boat_name != skipper 
           AND LOWER(boat_name) NOT LIKE '%boat%'
           AND LOWER(boat_name) NOT LIKE '%ship%'
           AND LOWER(boat_name) NOT LIKE '%yacht%'
           AND LOWER(boat_name) NOT LIKE '%sail%'
           AND LOWER(boat_name) NOT IN ('unknown', 'n/a', 'tbd', 'none')) 
           as potential_issues_count
        FROM RegattaNetworkData
      `;
      
      const summaryResult = await pool.query(summaryQuery);
      const summary = summaryResult.rows[0];

      // Get detailed examples of potential issues
      const detailsQuery = `
        SELECT 
          id,
          regatta_name,
          regatta_date,
          skipper,
          boat_name,
          yacht_club,
          sail_number,
          position,
          category
        FROM RegattaNetworkData 
        WHERE boat_name ~ '[A-Z][a-z]+ [A-Z][a-z]+' 
          AND boat_name != skipper 
          AND LOWER(boat_name) NOT LIKE '%boat%'
          AND LOWER(boat_name) NOT LIKE '%ship%'
          AND LOWER(boat_name) NOT LIKE '%yacht%'
          AND LOWER(boat_name) NOT LIKE '%sail%'
          AND LOWER(boat_name) NOT IN ('unknown', 'n/a', 'tbd', 'none')
        ORDER BY regatta_date DESC, regatta_name
        LIMIT $1
      `;
      
      const detailsResult = await pool.query(detailsQuery, [limit]);
      
      // Analyze patterns
      const patternQuery = `
        SELECT 
          boat_name,
          COUNT(*) as occurrence_count,
          COUNT(DISTINCT regatta_name) as regattas_affected,
          STRING_AGG(DISTINCT skipper, ', ' ORDER BY skipper LIMIT 5) as sample_skippers
        FROM RegattaNetworkData 
        WHERE boat_name ~ '[A-Z][a-z]+ [A-Z][a-z]+' 
          AND boat_name != skipper 
          AND LOWER(boat_name) NOT LIKE '%boat%'
          AND LOWER(boat_name) NOT LIKE '%ship%'
          AND LOWER(boat_name) NOT LIKE '%yacht%'
          AND LOWER(boat_name) NOT LIKE '%sail%'
          AND LOWER(boat_name) NOT IN ('unknown', 'n/a', 'tbd', 'none')
        GROUP BY boat_name
        ORDER BY occurrence_count DESC
        LIMIT 20
      `;
      
      const patternResult = await pool.query(patternQuery);

      return {
        summary: {
          total_records: parseInt(summary.total_records),
          total_sailors: parseInt(summary.total_sailors),
          total_regattas: parseInt(summary.total_regattas),
          total_clubs: parseInt(summary.total_clubs),
          potential_issues_count: parseInt(summary.potential_issues_count)
        },
        sample_issues: detailsResult.rows,
        top_patterns: patternResult.rows
      };
    } catch (error) {
      console.error('Error generating data quality report:', error);
      throw error;
    }
  }
}

module.exports = new RegattaService(); 