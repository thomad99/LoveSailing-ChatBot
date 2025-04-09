const { OpenAI } = require('openai');
require('dotenv').config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// System prompt template with information about our data
const SYSTEM_PROMPT = `You are a sailing race database assistant. You help users find information about sailors, races, and results.

Database Structure:
- Regatta: Information about sailing races
  * regatta_name: Name of the regatta/race
  * regatta_date: Date when the regatta took place
  * category: Boat type or race category
- Skippers: Information about sailors
  * skipper: Person's full name
  * yacht_club: Sailing club the person represents
  * sail_number: Identification number of the boat/sail
  * boat_name: Name of the boat
- Results: Performance data
  * position: position in the race the sailor finished
  * results: Detailed race results, showing individual race positions
  * total_points: Total points awarded during the race (lower is better)

Understand these synonyms:
- Person = Sailor = Skipper = Racer = Competitor
- Race = Regatta = Event = Competition
- Club = Team = Yacht Club = Organization

Valid query types and their expected JSON response formats:
1. sailor_search - Find information about a sailor by name
2. boat_search - Find information about a specific boat
3. top_sailors - Find top performers from a specific club
4. regatta_results - Show results for a specific regatta
5. database_status - Show database statistics
6. regatta_count - Count regattas in a specific year

If you can determine the query type, return the JSON with the appropriate parameters.
If you don't understand the query, return {"queryType": "database_status"}.

You must ALWAYS return a valid JSON object containing the queryType field.
`;

// Function to process a user query and determine the search intent
const processChatQuery = async (userQuestion) => {
  try {
    // Call OpenAI API to analyze the user's query
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview', // or whichever model is appropriate
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userQuestion }
      ],
      temperature: 0.3, // Lower temperature for more consistent results
      max_tokens: 500
    });

    // Get the assistant's response
    const assistantResponse = response.choices[0].message.content;
    
    // Try to parse the JSON response
    try {
      // Extract JSON from the response
      const jsonMatch = assistantResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0];
        const queryData = JSON.parse(jsonStr);
        return queryData;
      } else {
        // Fallback to database status if no JSON found
        console.warn('No JSON found in OpenAI response:', assistantResponse);
        return { queryType: 'database_status' };
      }
    } catch (parseError) {
      console.error('Error parsing JSON from OpenAI response:', parseError);
      console.log('OpenAI raw response:', assistantResponse);
      return { queryType: 'database_status' };
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return { queryType: 'database_status' };
  }
};

// Function to generate a natural language response to the user based on the data
const generateResponse = async (queryType, data) => {
  try {
    let contextPrompt = '';
    
    // Create a prompt based on the query type and data
    switch (queryType) {
      case 'sailor_search':
        contextPrompt = `Here is information about the sailor "${data.skipper}":\n${JSON.stringify(data.results, null, 2)}\n\nPlease provide a helpful summary about this sailor, including their club, achievements, and race history.`;
        break;
      case 'boat_search':
        contextPrompt = `Here is information about the boat "${data.boatName}":\n${JSON.stringify(data.results, null, 2)}\n\nPlease provide a helpful summary about this boat, including who sails it, its performance, and any other interesting details.`;
        break;
      case 'top_sailors':
        contextPrompt = `Here are the top sailors from ${data.yachtClub}:\n${JSON.stringify(data.results, null, 2)}\n\nPlease provide a summary ranking these sailors, mentioning their performance and achievements.`;
        break;
      case 'regatta_results':
        contextPrompt = `Here are the results for the regatta "${data.regattaName}":\n${JSON.stringify(data.results, null, 2)}\n\nPlease provide a summary of these regatta results, highlighting the top performers, notable clubs, and any interesting statistics.`;
        break;
      case 'database_status':
        contextPrompt = `Here are the current database statistics:\n${JSON.stringify(data, null, 2)}\n\nPlease provide a helpful summary of the database contents, highlighting the scope and breadth of the sailing data.`;
        break;
      case 'regatta_count':
        contextPrompt = `Here are the regattas that took place in ${data.year}:\n${JSON.stringify(data.results, null, 2)}\n\nPlease provide a summary of these regattas, their timing, and participation levels.`;
        break;
      default:
        contextPrompt = `Here is some information from the sailing database:\n${JSON.stringify(data, null, 2)}\n\nPlease provide a helpful response based on this data.`;
    }
    
    // Call OpenAI to generate a natural language response
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview', // or whichever model is appropriate
      messages: [
        { role: 'system', content: 'You are a helpful assistant specializing in sailing races. Provide clear, concise, and informative responses about sailing data.' },
        { role: 'user', content: contextPrompt }
      ],
      temperature: 0.7, // Slightly higher temperature for more natural responses
      max_tokens: 800
    });
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error generating response:', error);
    return 'I apologize, but there was an error processing your request. Please try again.';
  }
};

module.exports = {
  processChatQuery,
  generateResponse
}; 