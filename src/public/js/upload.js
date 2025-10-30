document.addEventListener('DOMContentLoaded', () => {
  const uploadForm = document.getElementById('uploadForm');
  const csvFileInput = document.getElementById('csvFile');
  const fileNameLabel = document.getElementById('fileNameLabel');
  const uploadStatusContainer = document.getElementById('uploadStatusContainer');
  const uploadStatus = document.getElementById('uploadStatus');
  const progressBar = document.getElementById('progressBar');
  const dataPreviewSection = document.getElementById('dataPreviewSection');
  const uploadSummary = document.getElementById('uploadSummary');
  const dataTableBody = document.getElementById('dataTableBody');
  
  // Update file name when a file is selected
  csvFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const fileName = e.target.files[0].name;
      fileNameLabel.textContent = fileName;
    } else {
      fileNameLabel.textContent = 'Choose a CSV file';
    }
  });
  
  // Handle form submission
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!csvFileInput.files.length) {
      showUploadStatus('error', 'Please select a CSV file to upload.');
      return;
    }
    
    const formData = new FormData();
    formData.append('csvFile', csvFileInput.files[0]);
    
    // Show upload status
    uploadStatusContainer.classList.remove('hidden');
    showUploadStatus('info', 'Uploading and processing CSV file...');
    
    // Simulate progress for better UX
    simulateProgress();
    
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (response.ok) {
        // Complete the progress bar
        progressBar.style.width = '100%';
        showUploadStatus('success', result.message);
        
        // Get the uploaded data to display a preview
        fetchAndDisplayData();
      } else {
        showUploadStatus('error', `Error: ${result.error} - ${result.message}`);
      }
    } catch (error) {
      showUploadStatus('error', `Error uploading file: ${error.message}`);
    }
  });
  
  // Show upload status with appropriate styling
  function showUploadStatus(type, message) {
    uploadStatus.textContent = message;
    uploadStatus.className = 'status';
    
    // Add appropriate class based on status type
    switch (type) {
      case 'error':
        uploadStatus.style.color = 'var(--error-color)';
        break;
      case 'success':
        uploadStatus.style.color = 'var(--success-color)';
        break;
      case 'warning':
        uploadStatus.style.color = 'var(--warning-color)';
        break;
      default:
        uploadStatus.style.color = 'var(--text-color)';
    }
  }
  
  // Simulate progress for better UX
  function simulateProgress() {
    let width = 0;
    const increment = 5;
    const maxWidth = 90; // Max 90% for simulation
    const intervalTime = 300;
    
    progressBar.style.width = '0%';
    
    const interval = setInterval(() => {
      if (width >= maxWidth) {
        clearInterval(interval);
      } else {
        width += increment;
        progressBar.style.width = `${width}%`;
      }
    }, intervalTime);
  }
  
  // Fetch and display the most recently uploaded data
  async function fetchAndDisplayData() {
    try {
      const response = await fetch('/api/data?limit=10');
      
      if (!response.ok) {
        console.error('Error fetching data preview');
        return;
      }
      
      const data = await response.json();
      
      if (data.success && data.data && data.data.length > 0) {
        // Show the data preview section
        dataPreviewSection.classList.remove('hidden');
        
        // Update the upload summary
        uploadSummary.innerHTML = `
          <p><strong>${data.count}</strong> records found in the database.</p>
          <p>Showing the most recent ${Math.min(10, data.data.length)} records below.</p>
        `;
        
        // Clear previous table data
        dataTableBody.innerHTML = '';
        
        // Add new data to the table
        data.data.slice(0, 10).forEach(record => {
          const row = document.createElement('tr');
          
          const regattaCell = document.createElement('td');
          regattaCell.textContent = record.regatta_name || '-';
          
          const dateCell = document.createElement('td');
          dateCell.textContent = record.regatta_date ? new Date(record.regatta_date).toLocaleDateString() : '-';
          
          const skipperCell = document.createElement('td');
          skipperCell.textContent = record.skipper || '-';
          
          const positionCell = document.createElement('td');
          positionCell.textContent = record.position || '-';
          
          const clubCell = document.createElement('td');
          clubCell.textContent = record.yacht_club || '-';
          
          const categoryCell = document.createElement('td');
          categoryCell.textContent = record.category || '-';
          
          row.appendChild(regattaCell);
          row.appendChild(dateCell);
          row.appendChild(skipperCell);
          row.appendChild(positionCell);
          row.appendChild(clubCell);
          row.appendChild(categoryCell);
          
          dataTableBody.appendChild(row);
        });
      }
    } catch (error) {
      console.error('Error fetching and displaying data:', error);
    }
  }
  
  // Expose fetchAndDisplayData for the stats feature
  window.fetchAndDisplayData = fetchAndDisplayData;
}); 