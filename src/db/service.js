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
      console.log(`Search returned ${result.rows.length} rows`);
      if (result.rows.length > 0) {
        console.log('First result sample:', result.rows[0]);
      }
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
        MAX(regatta_date) as latest_date
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

  // Get regatta statistics (biggest, smallest, etc.)
  async getRegattaStats(metric = 'largest') {
    try {
      // Get regattas with participant counts
      const query = `
        SELECT 
          regatta_name,
          regatta_date,
          COUNT(DISTINCT skipper) as participant_count,
          COUNT(*) as total_records,
          COUNT(DISTINCT yacht_club) as clubs_represented
        FROM RegattaNetworkData
        WHERE regatta_name IS NOT NULL AND regatta_name != ''
        GROUP BY regatta_name, regatta_date
      `;
      
      const result = await pool.query(query);
      const regattas = result.rows;
      
      if (regattas.length === 0) {
        return null;
      }
      
      let selectedRegattas = [];
      
      switch (metric.toLowerCase()) {
        case 'largest':
        case 'biggest':
        case 'most':
          // Regatta with most participants
          const largest = regattas.reduce((max, r) => 
            parseInt(r.participant_count) > parseInt(max.participant_count) ? r : max
          );
          selectedRegattas = [largest];
          break;
          
        case 'smallest':
        case 'least':
          // Regatta with fewest participants
          const smallest = regattas.reduce((min, r) => 
            parseInt(r.participant_count) < parseInt(min.participant_count) ? r : min
          );
          selectedRegattas = [smallest];
          break;
          
        case 'recent':
          // Most recent regattas
          selectedRegattas = regattas
            .sort((a, b) => new Date(b.regatta_date) - new Date(a.regatta_date))
            .slice(0, 5);
          break;
          
        case 'upcoming':
          // Future regattas (if any) or most recent if none upcoming
          const today = new Date();
          const upcoming = regattas
            .filter(r => new Date(r.regatta_date) > today)
            .sort((a, b) => new Date(a.regatta_date) - new Date(b.regatta_date));
          
          if (upcoming.length > 0) {
            selectedRegattas = upcoming.slice(0, 5);
          } else {
            // If no upcoming, show most recent
            selectedRegattas = regattas
              .sort((a, b) => new Date(b.regatta_date) - new Date(a.regatta_date))
              .slice(0, 5);
          }
          break;
          
        default:
          selectedRegattas = regattas.slice(0, 10);
      }
      
      return {
        metric,
        regattas: selectedRegattas,
        totalRegattas: regattas.length
      };
    } catch (error) {
      console.error('Error getting regatta stats:', error);
      throw error;
    }
  }

  // Search regattas by criteria
  async searchRegattas(criteria) {
    try {
      let query = `
        SELECT 
          regatta_name,
          regatta_date,
          COUNT(DISTINCT skipper) as participant_count,
          COUNT(DISTINCT yacht_club) as clubs_represented
        FROM RegattaNetworkData
        WHERE regatta_name IS NOT NULL AND regatta_name != ''
      `;
      const values = [];
      let valueIndex = 1;
      
      if (criteria.year) {
        query += ` AND EXTRACT(YEAR FROM regatta_date) = $${valueIndex}`;
        values.push(criteria.year);
        valueIndex++;
      }
      
      if (criteria.dateRange === 'recent') {
        query += ` AND regatta_date <= CURRENT_DATE ORDER BY regatta_date DESC`;
      } else if (criteria.dateRange === 'upcoming') {
        query += ` AND regatta_date > CURRENT_DATE ORDER BY regatta_date ASC`;
      } else {
        query += ` ORDER BY regatta_date DESC`;
      }
      
      if (criteria.limit) {
        query += ` LIMIT $${valueIndex}`;
        values.push(criteria.limit);
      }
      
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Error searching regattas:', error);
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

  // Get comprehensive club summary
  async getClubSummary(clubName) {
    try {
      // Get club skippers with stats
      const skippers = await this.getClubSkippers(clubName);
      
      if (skippers.length === 0) {
        return null;
      }
      
      // Get distinct categories/boat classes
      const categoriesQuery = `
        SELECT DISTINCT category
        FROM RegattaNetworkData
        WHERE yacht_club ILIKE $1 OR yacht_club ILIKE $2 OR yacht_club ILIKE $3 OR yacht_club ILIKE $4
        AND category IS NOT NULL AND category != ''
        ORDER BY category
      `;
      
      const categoriesResult = await pool.query(categoriesQuery, [
        `%${clubName}%`,
        `%${clubName.toUpperCase()}%`,
        `%${clubName.toLowerCase()}%`,
        `%${clubName.replace(/\s+/g, '')}%`
      ]);
      
      // Sort skippers by average position (best first) for top 5
      const sortedByAvg = [...skippers]
        .filter(s => s.avg_position != null)
        .sort((a, b) => parseFloat(a.avg_position) - parseFloat(b.avg_position))
        .slice(0, 5);
      
      // Get most active sailor (most races)
      const mostActive = skippers.length > 0 
        ? skippers.reduce((max, s) => (s.total_races > max.total_races ? s : max), skippers[0])
        : null;
      
      return {
        clubName: skippers[0]?.yacht_club || clubName,
        totalSailors: skippers.length,
        topSailorsByAvg: sortedByAvg,
        mostActiveSailor: mostActive,
        categories: categoriesResult.rows.map(r => r.category).filter(c => c)
      };
    } catch (error) {
      console.error('Error getting club summary:', error);
      throw error;
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

  // Get top clubs by number of sailors
  async getTopClubs(limit = 10) {
    const query = `
      SELECT 
        yacht_club,
        COUNT(DISTINCT skipper) as sailor_count,
        COUNT(*) as total_races,
        COUNT(DISTINCT regatta_name) as regattas_attended
      FROM RegattaNetworkData
      WHERE yacht_club IS NOT NULL AND yacht_club != '' AND yacht_club != 'Unknown'
      GROUP BY yacht_club
      ORDER BY sailor_count DESC, total_races DESC
      LIMIT $1
    `;
    
    try {
      const result = await pool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      console.error('Error getting top clubs:', error);
      throw error;
    }
  }

  // Get most active sailor (person with most races)
  async getMostActiveSailor() {
    const query = `
      SELECT 
        skipper,
        yacht_club,
        COUNT(*) as total_races,
        COUNT(DISTINCT regatta_name) as regattas_attended,
        AVG(CASE WHEN position ~ '^[0-9]+$' THEN CAST(position AS INTEGER) ELSE NULL END) as avg_position,
        MIN(CASE WHEN position ~ '^[0-9]+$' THEN CAST(position AS INTEGER) ELSE NULL END) as best_position,
        MAX(regatta_date) as last_race_date
      FROM RegattaNetworkData
      WHERE skipper IS NOT NULL AND skipper != ''
      GROUP BY skipper, yacht_club
      ORDER BY total_races DESC
      LIMIT 1
    `;
    
    try {
      const result = await pool.query(query);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting most active sailor:', error);
      throw error;
    }
  }

  // Get detailed database report with various insights
  async getDataQualityReport(limit = 100) {
    try {
      // Get summary statistics
      const summaryQuery = `
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT skipper) as total_sailors,
          COUNT(DISTINCT regatta_name) as total_regattas,
          COUNT(DISTINCT yacht_club) as total_clubs,
          MIN(regatta_date) as earliest_date,
          MAX(regatta_date) as latest_date,
          COUNT(*) FILTER (WHERE skipper IS NULL OR skipper = '') as missing_skippers,
          COUNT(*) FILTER (WHERE boat_name IS NULL OR boat_name = '') as missing_boat_names
        FROM RegattaNetworkData
      `;
      
      const summaryResult = await pool.query(summaryQuery);
      const summary = summaryResult.rows[0];

      // Get most active sailors
      const topSailorsQuery = `
        SELECT 
          skipper,
          yacht_club,
          COUNT(*) as race_count,
          AVG(CASE WHEN position ~ '^[0-9]+$' THEN CAST(position AS INTEGER) ELSE NULL END) as avg_position
        FROM RegattaNetworkData
        WHERE skipper IS NOT NULL AND skipper != ''
        GROUP BY skipper, yacht_club
        ORDER BY race_count DESC
        LIMIT $1
      `;
      
      const topSailorsResult = await pool.query(topSailorsQuery, [20]);
      
      // Get most recent records
      const recentRecordsQuery = `
        SELECT 
          id,
          regatta_name,
          regatta_date,
          skipper,
          boat_name,
          yacht_club,
          position
        FROM RegattaNetworkData 
        ORDER BY regatta_date DESC, id DESC
        LIMIT $1
      `;
      
      const recentRecordsResult = await pool.query(recentRecordsQuery, [limit]);

      return {
        summary: {
          total_records: parseInt(summary.total_records),
          total_sailors: parseInt(summary.total_sailors),
          total_regattas: parseInt(summary.total_regattas),
          total_clubs: parseInt(summary.total_clubs),
          earliest_date: summary.earliest_date,
          latest_date: summary.latest_date,
          missing_skippers: parseInt(summary.missing_skippers || 0),
          missing_boat_names: parseInt(summary.missing_boat_names || 0)
        },
        top_sailors: topSailorsResult.rows,
        recent_records: recentRecordsResult.rows
      };
    } catch (error) {
      console.error('Error generating database report:', error);
      throw error;
    }
  }
}

module.exports = new RegattaService(); 