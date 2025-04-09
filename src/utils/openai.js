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

IMPORTANT SEARCH INSTRUCTIONS:
- When a user inputs what appears to be a name, ALWAYS assume they are searching for a skipper
- Names, sailors, skippers, kids, adults, people, racers, etc. all refer to the skipper field
- Prioritize sailor_search for any input that resembles a person's name
- Allow for partial or fuzzy name matches (e.g., "John" should match "John Smith")
- For ambiguous queries with names, default to sailor_search over other query types

RESPONSE STYLE:
- Keep answers short and concise
- Use statistics prominently in your responses
- Present information in bullet points when possible
- Begin with a summary of key statistics, for example:
  * "I know about X sailing clubs"
  * "I have Y regattas in my database"
  * "There are Z different sailors in my records"
- Avoid lengthy explanations

Understand these synonyms:
- Person = Sailor = Skipper = Racer = Competitor = Kid = Adult
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
    // Simple name detection for common name inputs
    // Check if the query appears to be just a name without other context
    const isLikelyName = /^[A-Z][a-z]+(?: [A-Z][a-z]+){0,2}$/.test(userQuestion.trim());
    if (isLikelyName) {
      console.log('Detected likely name input:', userQuestion);
      return {
        queryType: 'sailor_search',
        skipper: userQuestion.trim()
      };
    }
    
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
        
        // For sailor_search queries, ensure the skipper parameter is set properly
        if (queryData.queryType === 'sailor_search' && !queryData.skipper && userQuestion.trim()) {
          queryData.skipper = userQuestion.trim();
        }
        
        return queryData;
      } else {
        // Check if the query might be a name without clear context
        // Simple heuristic: if query has 1-3 words and starts with capital letter
        const words = userQuestion.trim().split(/\s+/);
        if (words.length <= 3 && /^[A-Z]/.test(words[0])) {
          return { 
            queryType: 'sailor_search',
            skipper: userQuestion.trim()
          };
        }
        
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
        contextPrompt = `Here is information about the sailor "${data.skipper}":\n${JSON.stringify(data.results, null, 2)}\n\nPlease provide a concise bullet-point summary about this sailor, including their club, achievements, and race history. Start with key statistics.`;
        break;
      case 'boat_search':
        contextPrompt = `Here is information about the boat "${data.boatName}":\n${JSON.stringify(data.results, null, 2)}\n\nPlease provide a concise bullet-point summary about this boat, including who sails it, its performance, and any other interesting statistics.`;
        break;
      case 'top_sailors':
        contextPrompt = `Here are the top sailors from ${data.yachtClub}:\n${JSON.stringify(data.results, null, 2)}\n\nPlease provide a concise bullet-point ranking of these sailors, mentioning their performance statistics.`;
        break;
      case 'regatta_results':
        contextPrompt = `Here are the results for the regatta "${data.regattaName}":\n${JSON.stringify(data.results, null, 2)}\n\nPlease provide a concise bullet-point summary of these regatta results, highlighting the top performers, notable clubs, and key statistics.`;
        break;
      case 'database_status':
        contextPrompt = `Here are the current database statistics:\n${JSON.stringify(data, null, 2)}\n\nPlease provide a concise bullet-point summary of the database contents, highlighting key statistics such as "I know about X sailing clubs", "I have Y regattas in my database", etc.`;
        break;
      case 'regatta_count':
        contextPrompt = `Here are the regattas that took place in ${data.year}:\n${JSON.stringify(data.results, null, 2)}\n\nPlease provide a concise bullet-point summary of these regattas, their timing, and participation statistics.`;
        break;
      default:
        contextPrompt = `Here is some information from the sailing database:\n${JSON.stringify(data, null, 2)}\n\nPlease provide a helpful concise, bullet-point response based on this data, emphasizing key statistics.`;
    }
    
    // Call OpenAI to generate a natural language response
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview', // or whichever model is appropriate
      messages: [
        { role: 'system', content: 'You are a helpful assistant specializing in sailing races. Provide clear, concise, and informative responses about sailing data. Use bullet points and statistics prominently. Keep answers short.' },
        { role: 'user', content: contextPrompt }
      ],
      temperature: 0.7, // Slightly higher temperature for more natural responses
      max_tokens: 500
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