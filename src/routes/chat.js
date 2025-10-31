const express = require('express');
const router = express.Router();
const { processChatQuery, generateResponse } = require('../utils/openai');
const regattaService = require('../db/service');

// Route to handle chat queries
router.post('/', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: 'Missing query parameter',
        message: 'Please provide a query to process'
      });
    }
    
    // Process the user's query to determine the intent
    const queryData = await processChatQuery(query);
    console.log('Query classified as:', queryData.queryType);
    let data = null;
    
    // Retrieve the appropriate data based on the query type
    switch (queryData.queryType) {
      case 'sailor_search':
        const sailorResults = await regattaService.searchRecords({ skipper: queryData.skipper });
        data = {
          skipper: queryData.skipper,
          results: sailorResults
        };
        break;
        
      case 'club_skippers':
        const clubResults = await regattaService.getClubSkippers(queryData.clubName);
        data = {
          clubName: queryData.clubName,
          results: clubResults
        };
        break;
        
      case 'boat_search':
        const boatResults = await regattaService.searchRecords({ boat_name: queryData.boatName });
        data = {
          boatName: queryData.boatName,
          results: boatResults
        };
        break;
        
      case 'top_sailors':
        const limit = queryData.limit || 10;
        const topSailors = await regattaService.getTopSailors(queryData.yachtClub, limit);
        data = {
          yachtClub: queryData.yachtClub,
          limit: limit,
          results: topSailors
        };
        break;
        
      case 'regatta_results':
        const regattaResults = await regattaService.getRegattaResults(queryData.regattaName);
        data = {
          regattaName: queryData.regattaName,
          results: regattaResults
        };
        break;
        
      case 'database_status':
        data = await regattaService.getDatabaseStats();
        break;
        
      case 'regatta_count':
        const regattaCounts = await regattaService.getRegattaCountByYear(queryData.year);
        data = {
          year: queryData.year,
          results: regattaCounts
        };
        break;
        
      case 'top_clubs':
        const clubLimit = queryData.limit || 10;
        const topClubs = await regattaService.getTopClubs(clubLimit);
        data = {
          limit: clubLimit,
          results: topClubs
        };
        break;
        
      case 'most_active_sailor':
        const mostActive = await regattaService.getMostActiveSailor();
        data = {
          sailor: mostActive
        };
        break;
        
      default:
        data = await regattaService.getDatabaseStats();
    }
    
    // Generate a natural language response based on the data
    console.log('Data retrieved:', JSON.stringify(data).substring(0, 200) + '...');
    const responseText = await generateResponse(queryData.queryType, data);
    console.log('Response generated, length:', responseText.length);
    
    res.status(200).json({
      success: true,
      queryType: queryData.queryType,
      response: responseText,
      data: data
    });
  } catch (error) {
    console.error('Error processing chat query:', error);
    res.status(500).json({
      error: 'Error processing chat query',
      message: error.message
    });
  }
});

module.exports = router; 