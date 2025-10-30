const express = require('express');
const router = express.Router();
const regattaService = require('../db/service');

// Get all regatta records
router.get('/', async (req, res) => {
  try {
    const records = await regattaService.getAllRecords();
    res.status(200).json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({
      error: 'Error fetching records',
      message: error.message
    });
  }
});

// Search records with various criteria
router.get('/search', async (req, res) => {
  try {
    // Extract search criteria from query parameters
    const criteria = {
      skipper: req.query.skipper,
      boat_name: req.query.boat_name,
      yacht_club: req.query.yacht_club,
      regatta_name: req.query.regatta_name,
      year: req.query.year
    };
    
    // Remove undefined values
    Object.keys(criteria).forEach(key => {
      if (criteria[key] === undefined) {
        delete criteria[key];
      }
    });
    
    if (Object.keys(criteria).length === 0) {
      return res.status(400).json({
        error: 'No search criteria provided',
        message: 'Please provide at least one search parameter'
      });
    }
    
    const results = await regattaService.searchRecords(criteria);
    res.status(200).json({
      success: true,
      count: results.length,
      criteria: criteria,
      data: results
    });
  } catch (error) {
    console.error('Error searching records:', error);
    res.status(500).json({
      error: 'Error searching records',
      message: error.message
    });
  }
});

// Get top sailors from a club
router.get('/top-sailors', async (req, res) => {
  try {
    const { yacht_club, limit } = req.query;
    
    if (!yacht_club) {
      return res.status(400).json({
        error: 'Missing yacht_club parameter',
        message: 'Please provide a yacht club name to search for'
      });
    }
    
    const limitValue = limit ? parseInt(limit) : 10;
    
    const results = await regattaService.getTopSailors(yacht_club, limitValue);
    res.status(200).json({
      success: true,
      count: results.length,
      yacht_club: yacht_club,
      data: results
    });
  } catch (error) {
    console.error('Error fetching top sailors:', error);
    res.status(500).json({
      error: 'Error fetching top sailors',
      message: error.message
    });
  }
});

// Get regatta results
router.get('/regatta-results', async (req, res) => {
  try {
    const { regatta_name } = req.query;
    
    if (!regatta_name) {
      return res.status(400).json({
        error: 'Missing regatta_name parameter',
        message: 'Please provide a regatta name to search for'
      });
    }
    
    const results = await regattaService.getRegattaResults(regatta_name);
    res.status(200).json({
      success: true,
      count: results.length,
      regatta_name: regatta_name,
      data: results
    });
  } catch (error) {
    console.error('Error fetching regatta results:', error);
    res.status(500).json({
      error: 'Error fetching regatta results',
      message: error.message
    });
  }
});

// Get database stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await regattaService.getDatabaseStats();
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching database stats:', error);
    res.status(500).json({
      error: 'Error fetching database stats',
      message: error.message
    });
  }
});

// Get regatta counts by year
router.get('/regatta-count', async (req, res) => {
  try {
    const { year } = req.query;
    
    if (!year) {
      return res.status(400).json({
        error: 'Missing year parameter',
        message: 'Please provide a year to search for'
      });
    }
    
    const results = await regattaService.getRegattaCountByYear(year);
    res.status(200).json({
      success: true,
      count: results.length,
      year: year,
      data: results
    });
  } catch (error) {
    console.error('Error fetching regatta count by year:', error);
    res.status(500).json({
      error: 'Error fetching regatta count by year',
      message: error.message
    });
  }
});

// Get data quality report
router.get('/data-quality-report', async (req, res) => {
  try {
    const { limit } = req.query;
    const limitValue = limit ? parseInt(limit) : 100;
    
    const report = await regattaService.getDataQualityReport(limitValue);
    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Error fetching data quality report:', error);
    res.status(500).json({
      error: 'Error fetching data quality report',
      message: error.message
    });
  }
});

module.exports = router; 