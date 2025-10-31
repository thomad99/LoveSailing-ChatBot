const { OpenAI } = require('openai');
require('dotenv').config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// System prompt template with information about our data
const SYSTEM_PROMPT = `You are an intelligent sailing race database assistant. You understand natural language queries and convert them into structured database queries.

Database Structure:
- Regatta: Information about sailing races
  * regatta_name: Name of the regatta/race
  * regatta_date: Date when the regatta took place
  * category: Boat type or race category (e.g., C420, RWB, Green Fleet, Laser, etc.)
- Skippers/Sailors: Information about people (skipper and sailor mean the same thing)
  * skipper: Person's full name (this field contains sailor names)
  * yacht_club: Sailing club the person represents (handles variations like SYS = Sarasota Youth Sailing)
  * sail_number: Identification number of the boat/sail
  * boat_name: Name of the boat (Note: Sometimes contains sailor names by mistake)
- Results: Performance data
  * position: Position in the race the sailor finished
  * results: Detailed race results, showing individual race positions
  * total_points: Total points awarded during the race (lower is better)

IMPORTANT CLUB QUERY RULES:
1. When users ask about sailors/skippers from a club, use club_skippers query type
2. Common club query patterns:
   - "skippers in [club]"
   - "sailors from [club]"
   - "who sails at [club]"
   - "[club] members"
   - "[club] sailors"
3. Handle club name variations:
   - Full names (e.g., "Sarasota Youth Sailing")
   - Abbreviations (e.g., "SYS")
   - Case variations (e.g., "sys", "Sys")
4. For club queries, return: {"queryType": "club_skippers", "clubName": "club name"}

TABLE FORMATTING RULES:
1. Always use proper markdown table syntax with headers
2. Align numbers to the right using :---:
3. Include a header row with clear column names
4. Format dates as YYYY-MM-DD
5. Round averages to 2 decimal places
6. Add a total count at the bottom if more than 15 rows
7. Sort data meaningfully (e.g., by performance or date)
8. Include units where applicable
9. Use consistent capitalization

Example table format:
| Column 1 | Number Col | Date Col |
|:---------|:----------:|:--------:|
| Data     | 123.45     | 2024-03-20 |

RESPONSE STYLE:
- Keep answers short and concise
- Use statistics prominently in your responses
- Present information in bullet points when possible
- Begin with a summary of key statistics
- Avoid lengthy explanations
- ALWAYS format data in tables when showing multiple records

Understand these synonyms:
- Person = Sailor = Skipper = Racer = Competitor = Kid = Adult = Helm = Captain
- Race = Regatta = Event = Competition
- Club = Team = Yacht Club = Organization

Valid query types and their expected JSON response formats:
1. sailor_search - Find information about a sailor by name
   Examples: "find john", "tell me about Sarah Smith", "do you have data on Dominic Thomas"
   Return: {"queryType": "sailor_search", "skipper": "person's name"}

2. boat_search - Find information about a specific boat
   Examples: "find boat Wind Runner", "who sails Blue Horizon"
   Return: {"queryType": "boat_search", "boatName": "boat name"}

3. top_sailors - Find top performers from a specific club
   Examples: "best sailors from SYS", "top performers at LYC"
   Return: {"queryType": "top_sailors", "yachtClub": "club name", "limit": 10}

4. regatta_results - Show results for a specific regatta
   Examples: "results for Spring Series", "who won Gasparilla Regatta"
   Return: {"queryType": "regatta_results", "regattaName": "regatta name"}

5. database_status - Show database statistics
   Examples: "how many sailors", "database stats", "what's in the database"

6. regatta_count - Count regattas in a specific year
   Examples: "regattas in 2024", "races last year"
   Return: {"queryType": "regatta_count", "year": 2024}

7. club_skippers - List all skippers from a specific club
   Examples: "club SYS", "sailors from LYC"

8. regatta_stats - Get statistics about regattas (participants, dates, etc.)
   Examples: "biggest regatta", "largest regatta", "most participants", "smallest regatta", "regatta with most sailors"
   Return: {"queryType": "regatta_stats", "metric": "largest|smallest|recent|upcoming"}

9. regatta_search - Search for regattas by various criteria
   Examples: "regattas in 2024", "recent regattas", "upcoming regattas"
   Return: {"queryType": "regatta_search", "year": 2024, "dateRange": "recent|upcoming"}

10. location_query - Regattas by location (if location data available)
    Examples: "regattas near me", "races in Florida", "events near Sarasota"
    Return: {"queryType": "location_query", "location": "location name", "needsLocation": true}

IMPORTANT: 
- If the user asks about a person by name with ANY phrasing, extract the NAME and use sailor_search
- For comparative queries like "biggest", "smallest", "most", "least", use appropriate query types
- For location queries like "near me", set needsLocation: true and ask for location
- For date-related queries, extract year or date range
- Interpret natural language flexibly - users may phrase things differently

CLUB QUERY PATTERNS - These should use club_skippers query type:
- "club [name]" or "[name] club" -> {"queryType": "club_skippers", "clubName": "[name]"}
- "tell me about [club]" or "info on [club]" -> {"queryType": "club_skippers", "clubName": "[club]"}
- Just "[club]" or "[abbreviation]" (if it's likely a club name/abbreviation) -> {"queryType": "club_skippers", "clubName": "[club]"}
- Common club abbreviations: SYS, LYC, SBYC, etc. Treat these as clubs if the query is just the abbreviation.

SPECIAL QUERIES:
- "top X clubs" or "most active clubs" -> {"queryType": "top_clubs", "limit": X}
- "sailor with most races" or "most active sailor" -> {"queryType": "most_active_sailor"}
- "how many sailors listed" -> {"queryType": "database_status"}

If you can determine the query type, return the JSON with the appropriate parameters.
If you don't understand the query, return {"queryType": "unknown"}.

You must ALWAYS return a valid JSON object containing the queryType field.`;

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
    
    // Check for club queries - patterns like "club SYS", "SYS club", or just "SYS" (common abbreviations)
    const clubPattern = /(?:club|yacht\s*club|team)\s+([^\s]+)|^([A-Z]{2,5})$/i;
    const clubMatch = userQuestion.match(clubPattern);
    if (clubMatch) {
      const clubName = clubMatch[1] || clubMatch[2];
      if (clubName) {
        console.log('Detected club query:', clubName);
        return {
          queryType: 'club_skippers',
          clubName: clubName.trim()
        };
      }
    }
    
    // Check if the query is explicitly about regatta results
    const regattaPattern = /(?:results?|positions?|race|sailors?|competitors?)\s+(?:of|in|for|from)?\s+(.+?)(?:\s+regatta|\s+race|\s+results?)?$/i;
    const regattaMatch = userQuestion.match(regattaPattern);
    if (regattaMatch) {
      console.log('Detected regatta results query:', regattaMatch[1]);
      return {
        queryType: 'regatta_results',
        regattaName: regattaMatch[1].trim()
      };
    }
    
    // Call OpenAI API to analyze the user's query
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
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
          // This could be a person name, club, boat, or regatta
          // Try searching for it as a sailor first
          return { 
            queryType: 'sailor_search',
            skipper: userQuestion.trim()
          };
        }
        
        // Fallback to unknown if no JSON found
        console.warn('No JSON found in OpenAI response:', assistantResponse);
        console.warn('Raw response was:', assistantResponse);
        return { queryType: 'unknown', original: userQuestion };
      }
    } catch (parseError) {
      console.error('Error parsing JSON from OpenAI response:', parseError);
      console.log('OpenAI raw response:', assistantResponse);
      return { queryType: 'unknown', original: userQuestion };
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return { queryType: 'unknown', original: userQuestion };
  }
};

// Function to generate a natural language response to the user based on the data
const generateResponse = async (queryType, data) => {
  try {
    // If we explicitly don't understand, return a friendly fallback without calling OpenAI
    if (queryType === 'unknown') {
      return 'Sorry, I don\'t understand. Please try rephrasing the question (e.g., "find sailor Dominic Thomas", "club SYS", "biggest regatta").';
    }
    let contextPrompt = '';
    
    // Create a prompt based on the query type and data
    switch (queryType) {
      case 'club_skippers':
        if (!data.results || data.results.length === 0) {
          contextPrompt = `No data found for club "${data.clubName}". Return a polite message saying "I couldn't find any data for ${data.clubName} in my database."`;
        } else {
          contextPrompt = `I found the sailing club ${data.clubName || 'unknown'}.

Summary data:
- Total sailors: ${data.totalSailors || 0}
- Top 5 sailors by average position: ${JSON.stringify(data.topSailorsByAvg || [], null, 2)}
- Most active sailor: ${JSON.stringify(data.mostActiveSailor || null, null, 2)}
- Boat classes/categories: ${JSON.stringify(data.categories || [], null, 2)}

Format the response EXACTLY as follows:
1. "I found the sailing club [club name]"
2. "It has [X] Sailors listed"
3. "The top 5 sailors are:" followed by a table showing: | Name | Avg Position | Total Races |
   Use proper markdown table formatting. Round averages to 2 decimal places.
4. "Sailor [name] shows the most regatta entries totalling [N]"
5. "They show sailors in class [category1], [category2], [category3]" (list all categories separated by commas)

Use only factual data without additional commentary.`;
        }
        break;
      case 'sailor_search':
        if (!data.results || data.results.length === 0) {
          contextPrompt = `No data found for sailor "${data.skipper}". Return a polite message saying "I couldn't find any sailing data for ${data.skipper} in my database."`;
        } else {
          contextPrompt = `Here is information about the sailor "${data.skipper}":\n${JSON.stringify(data.results, null, 2)}\n\nProvide only a structured fact sheet with the key information about this sailor organized by categories: 1) Basic info (name, club), 2) Top achievements (positions 1-3 only, with regatta names and dates), 3) Recent race history (only list positions and race names). Include only factual data without commentary.`;
        }
        break;
      case 'boat_search':
        if (!data.results || data.results.length === 0) {
          contextPrompt = `No data found for boat "${data.boatName}". Return a polite message saying "I couldn't find any data for ${data.boatName} in my database."`;
        } else {
          contextPrompt = `Here is information about the boat "${data.boatName}":\n${JSON.stringify(data.results, null, 2)}\n\nProvide only a structured fact sheet about this boat, with factual data about who sails it and its performance record.`;
        }
        break;
      case 'top_sailors':
        contextPrompt = `Here are the top sailors from ${data.yachtClub}:\n${JSON.stringify(data.results, null, 2)}\n\nList only the sailors' names, clubs, and key performance statistics in a compact format.`;
        break;
      case 'regatta_results':
        contextPrompt = `Here are the results for the regatta "${data.regattaName}":\n${JSON.stringify(data.results, null, 2)}\n\n
Format the response as follows:
1. First line: Regatta name and date
2. Second line: Total number of competitors
3. Then a table with columns:
   | Position | Sailor | Club | Boat | Results | Points |
   Use proper markdown table formatting with right-aligned numbers.
   Sort by position (numerical first, then special positions like DNF).
   If more than 15 competitors, show only top 15 and add total count at bottom.`;
        break;
      case 'database_status':
        contextPrompt = `Here are the current database statistics:\n${JSON.stringify(data, null, 2)}\n\nProvide only the key statistics as bullet points showing total records, sailors, regattas, and clubs with their counts.`;
        break;
      case 'regatta_count':
        contextPrompt = `Here are the regattas that took place in ${data.year}:\n${JSON.stringify(data.results, null, 2)}\n\nList only regatta names, dates, and participant counts in a compact tabular format.`;
        break;
      case 'top_clubs':
        contextPrompt = `Here are the top ${data.limit} clubs by number of sailors:\n${JSON.stringify(data.results, null, 2)}\n\n
Format the response as follows:
1. First line: "Top ${data.limit} Clubs"
2. Then a table with columns:
   | Club | Sailors | Total Races | Regattas Attended |
   Use proper markdown table formatting with right-aligned numbers.
   Sort by number of sailors (descending).
   Round averages to 2 decimal places.`;
        break;
      case 'most_active_sailor':
        contextPrompt = `Here is information about the most active sailor:\n${JSON.stringify(data.sailor, null, 2)}\n\n
Format the response as follows:
1. First line: Name and club
2. Then a table with columns:
   | Metric | Value |
   | Total Races | X |
   | Regattas Attended | X |
   | Average Position | X.XX |
   | Best Position | X |
   | Last Race | YYYY-MM-DD |
   Use proper markdown table formatting with right-aligned numbers.`;
        break;
      default:
        contextPrompt = `Here is some information from the sailing database:\n${JSON.stringify(data, null, 2)}\n\nProvide only a compact list of the key statistics or data points shown, without commentary.`;
    }
    
    // Call OpenAI to generate a natural language response
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { 
          role: 'system', 
          content: 'You are a data reporting system for sailing competitions. Your responses should be extremely concise, focusing only on direct facts from the data without narrative or commentary. FORMAT GUIDELINES: 1) Always use proper markdown tables with headers and alignment, 2) Right-align numeric columns, 3) Format dates as YYYY-MM-DD, 4) Round averages to 2 decimal places, 5) Sort data meaningfully, 6) Include total counts when available, 7) NO narrative descriptions - just facts and properly formatted tables.' 
        },
        { role: 'user', content: contextPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
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
