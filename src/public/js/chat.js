document.addEventListener('DOMContentLoaded', () => {
  const chatForm = document.getElementById('chatForm');
  const userInput = document.getElementById('userInput');
  const chatMessages = document.getElementById('chatMessages');
  const dataTable = document.getElementById('dataTable');
  const dataTableHead = document.getElementById('dataTableHead');
  const dataTableBody = document.getElementById('dataTableBody');
  const noDataMessage = document.getElementById('noDataMessage');
  
  // Handle form submission
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const query = userInput.value.trim();
    
    if (!query) return;
    
    // Add user message to chat
    addMessage('user', query);
    
    // Clear input
    userInput.value = '';
    
    // Add loading indicator
    const loadingMessageId = addLoadingMessage();
    
    try {
      // Send the query to the server
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get response from server');
      }
      
      const result = await response.json();
      
      // Remove loading indicator
      removeLoadingMessage(loadingMessageId);
      
      // Add assistant's response to chat
      addMessage('assistant', result.response);
      
      // Update data table
      updateDataTable(result.queryType, result.data);
    } catch (error) {
      console.error('Error processing chat query:', error);
      
      // Remove loading indicator
      removeLoadingMessage(loadingMessageId);
      
      // Add error message
      addMessage('assistant', 'Sorry, there was an error processing your request. Please try again.');
    }
  });
  
  // Add a message to the chat
  function addMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    // Process content to handle markdown-like formatting
    const formattedContent = formatMessageContent(content);
    messageContent.innerHTML = formattedContent;
    
    messageDiv.appendChild(messageContent);
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageDiv.id;
  }
  
  // Add loading message with animated dots
  function addLoadingMessage() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message loading';
    messageDiv.id = 'loading-message-' + Date.now();
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    const dots = document.createElement('div');
    dots.className = 'dots';
    
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'dot';
      dots.appendChild(dot);
    }
    
    messageContent.appendChild(dots);
    messageDiv.appendChild(messageContent);
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageDiv.id;
  }
  
  // Remove loading message
  function removeLoadingMessage(id) {
    const loadingMessage = document.getElementById(id);
    if (loadingMessage) {
      loadingMessage.remove();
    }
  }
  
  // Format message content to handle markdown-like syntax
  function formatMessageContent(content) {
    // Handle line breaks
    let formattedContent = content.replace(/\n/g, '<br>');
    
    // Handle bold text
    formattedContent = formattedContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Handle italic text
    formattedContent = formattedContent.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Handle lists
    const listItems = formattedContent.match(/- (.*?)(<br>|$)/g);
    if (listItems) {
      let list = '<ul>';
      listItems.forEach(item => {
        const listItemContent = item.replace(/- (.*?)(<br>|$)/, '$1');
        list += `<li>${listItemContent}</li>`;
        formattedContent = formattedContent.replace(item, '');
      });
      list += '</ul>';
      formattedContent += list;
    }
    
    return formattedContent;
  }
  
  // Update the data table based on the query type and data
  function updateDataTable(queryType, data) {
    if (!data || Object.keys(data).length === 0) {
      showNoDataMessage();
      return;
    }
    
    // Format data based on query type
    let headers = [];
    let rows = [];
    
    switch (queryType) {
      case 'sailor_search':
        if (!data.results || data.results.length === 0) {
          showNoDataMessage(`No results found for sailor "${data.skipper}"`);
          return;
        }
        
        headers = ['Regatta', 'Date', 'Position', 'Club', 'Boat', 'Results'];
        rows = data.results.map(record => [
          record.regatta_name || '-',
          formatDate(record.regatta_date),
          record.position || '-',
          record.yacht_club || '-',
          record.boat_name || '-',
          record.results || '-'
        ]);
        break;
        
      case 'boat_search':
        if (!data.results || data.results.length === 0) {
          showNoDataMessage(`No results found for boat "${data.boatName}"`);
          return;
        }
        
        headers = ['Boat Name', 'Skipper', 'Regatta', 'Date', 'Position'];
        rows = data.results.map(record => [
          record.boat_name || '-',
          record.skipper || '-',
          record.regatta_name || '-',
          formatDate(record.regatta_date),
          record.position || '-'
        ]);
        break;
        
      case 'top_sailors':
        if (!data.results || data.results.length === 0) {
          showNoDataMessage(`No top sailors found for club "${data.yachtClub}"`);
          return;
        }
        
        headers = ['Skipper', 'Club', 'Race Count', 'Avg Position', 'Best Position'];
        rows = data.results.map(record => [
          record.skipper || '-',
          record.yacht_club || '-',
          record.race_count || '-',
          formatDecimal(record.avg_position),
          record.best_position || '-'
        ]);
        break;
        
      case 'regatta_results':
        if (!data.results || data.results.length === 0) {
          showNoDataMessage(`No results found for regatta "${data.regattaName}"`);
          return;
        }
        
        headers = ['Position', 'Skipper', 'Club', 'Boat', 'Sail #', 'Points'];
        rows = data.results.map(record => [
          record.position || '-',
          record.skipper || '-',
          record.yacht_club || '-',
          record.boat_name || '-',
          record.sail_number || '-',
          record.total_points || '-'
        ]);
        break;
        
      case 'database_status':
        headers = ['Stat', 'Value'];
        rows = [
          ['Total Records', data.total_records || 0],
          ['Total Sailors', data.total_sailors || 0],
          ['Total Regattas', data.total_regattas || 0],
          ['Total Clubs', data.total_clubs || 0],
          ['Earliest Date', formatDate(data.earliest_date)],
          ['Latest Date', formatDate(data.latest_date)]
        ];
        break;
        
      case 'regatta_count':
        if (!data.results || data.results.length === 0) {
          showNoDataMessage(`No regattas found for year ${data.year}`);
          return;
        }
        
        headers = ['Regatta Name', 'Date', 'Participants'];
        rows = data.results.map(record => [
          record.regatta_name || '-',
          formatDate(record.regatta_date),
          record.participant_count || '-'
        ]);
        break;
        
      default:
        showNoDataMessage('No data available for this query type');
        return;
    }
    
    // Update the table
    updateTable(headers, rows);
  }
  
  // Show no data message
  function showNoDataMessage(message = 'No data available') {
    dataTable.style.display = 'none';
    noDataMessage.style.display = 'block';
    noDataMessage.querySelector('p').textContent = message;
  }
  
  // Update the table with headers and rows
  function updateTable(headers, rows) {
    if (headers.length === 0 || rows.length === 0) {
      showNoDataMessage();
      return;
    }
    
    // Show table and hide no data message
    dataTable.style.display = 'table';
    noDataMessage.style.display = 'none';
    
    // Update headers
    dataTableHead.innerHTML = '';
    const headerRow = document.createElement('tr');
    
    headers.forEach(headerText => {
      const th = document.createElement('th');
      th.textContent = headerText;
      headerRow.appendChild(th);
    });
    
    dataTableHead.appendChild(headerRow);
    
    // Update rows
    dataTableBody.innerHTML = '';
    
    rows.forEach(rowData => {
      const row = document.createElement('tr');
      
      rowData.forEach(cellData => {
        const td = document.createElement('td');
        td.textContent = cellData;
        row.appendChild(td);
      });
      
      dataTableBody.appendChild(row);
    });
  }
  
  // Format date string
  function formatDate(dateString) {
    if (!dateString) return '-';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    } catch (error) {
      return dateString;
    }
  }
  
  // Format decimal to 2 decimal places
  function formatDecimal(value) {
    if (value === undefined || value === null) return '-';
    
    try {
      return parseFloat(value).toFixed(2);
    } catch (error) {
      return value;
    }
  }
}); 