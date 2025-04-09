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
- IMPORTANT: Sometimes skipper names are incorrectly stored in the boat_name column, so both fields should be checked

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
        contextPrompt = `Here is information about the sailor "${data.skipper}":\n${JSON.stringify(data.results, null, 2)}\n\nProvide only a structured fact sheet with the key information about this sailor organized by categories: 1) Basic info (name, club), 2) Top achievements (positions 1-3 only, with regatta names and dates), 3) Recent race history (only list positions and race names). Include only factual data without commentary.`;
        break;
      case 'boat_search':
        contextPrompt = `Here is information about the boat "${data.boatName}":\n${JSON.stringify(data.results, null, 2)}\n\nProvide only a structured fact sheet about this boat, with factual data about who sails it and its performance record.`;
        break;
      case 'top_sailors':
        contextPrompt = `Here are the top sailors from ${data.yachtClub}:\n${JSON.stringify(data.results, null, 2)}\n\nList only the sailors' names, clubs, and key performance statistics in a compact format.`;
        break;
      case 'regatta_results':
        contextPrompt = `Here are the results for the regatta "${data.regattaName}":\n${JSON.stringify(data.results, null, 2)}\n\nList only the top 10 finishers with position, name and club in a compact tabular format.`;
        break;
      case 'database_status':
        contextPrompt = `Here are the current database statistics:\n${JSON.stringify(data, null, 2)}\n\nProvide only the key statistics as bullet points showing total records, sailors, regattas, and clubs with their counts. If potential_name_mismatches exists and is greater than 0, mention that there are potentially X sailor names incorrectly stored in the boat_name column.`;
        break;
      case 'regatta_count':
        contextPrompt = `Here are the regattas that took place in ${data.year}:\n${JSON.stringify(data.results, null, 2)}\n\nList only regatta names, dates, and participant counts in a compact tabular format.`;
        break;
      default:
        contextPrompt = `Here is some information from the sailing database:\n${JSON.stringify(data, null, 2)}\n\nProvide only a compact list of the key statistics or data points shown, without commentary.`;
    }
    
    // Call OpenAI to generate a natural language response
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview', // or whichever model is appropriate
      messages: [
        { role: 'system', content: 'You are a data reporting system for sailing competitions. Your responses should be extremely concise, focusing only on direct facts from the data without narrative, explanations or commentary. FORMAT GUIDELINES: 1) Use "Sailor:" as header for person data, 2) Use structured format with colon-separated values for statistics (e.g., "Position: 1st"), 3) Group information by categories, 4) Only include data that is present in the results, 5) For races and achievements, use compact bulleted lists with minimal text, 6) NO narrative descriptions - just facts. Limit your response to the most relevant data points without storytelling or explanations.' },
        { role: 'user', content: contextPrompt }
      ],
      temperature: 0.3, // Lower temperature for more consistent factual responses
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