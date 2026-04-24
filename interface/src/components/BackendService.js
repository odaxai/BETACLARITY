import axios from 'axios';

// Safely read env var injected by webpack if available, otherwise fallback.
// An empty string ("") means "same-origin" (production Docker, served by nginx).
/* eslint-disable no-undef */
const API_BASE_URL = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL !== undefined)
  ? process.env.REACT_APP_API_URL
  : 'http://localhost:8001';
/* eslint-enable no-undef */

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds timeout for image processing
});

// Add request interceptor for authentication if needed
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Send a message to the AI assistant
 * @param {string} message - User message text
 * @param {string} conversationId - Current conversation ID
 * @param {Array} history - Previous messages in the conversation
 * @returns {Promise} - Promise with AI response
 */
export const sendMessage = async (message, conversationId, history = []) => {
  try {
    const response = await apiClient.post('/chat', {
      message,
      conversation_id: conversationId,
      history,
    });
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

/**
 * Upload an image for analysis
 * @param {File} imageFile - Image file to upload
 * @param {string} conversationId - Current conversation ID
 * @returns {Promise} - Promise with upload result and image URL
 */
export const uploadImage = async (imageFile, conversationId) => {
  try {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('conversation_id', conversationId);
    
    const response = await apiClient.post('/api/upload/image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};

/**
 * Upload a document for analysis
 * @param {File} documentFile - Document file to upload
 * @param {string} conversationId - Current conversation ID
 * @returns {Promise} - Promise with upload result and document info
 */
export const uploadDocument = async (documentFile, conversationId) => {
  try {
    const formData = new FormData();
    formData.append('document', documentFile);
    formData.append('conversation_id', conversationId);
    
    const response = await apiClient.post('/api/upload/document', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data;
  } catch (error) {
    console.error('Error uploading document:', error);
    throw error;
  }
};

/**
 * Get image analysis results
 * @param {string} imageId - ID of the uploaded image
 * @returns {Promise} - Promise with analysis results
 */
export const getImageAnalysis = async (imageId) => {
  try {
    const response = await apiClient.get(`/api/analyze/image/${imageId}`);
    return response.data;
  } catch (error) {
    console.error('Error getting image analysis:', error);
    throw error;
  }
};

/**
 * Create a new conversation
 * @returns {Promise} - Promise with new conversation ID
 */
export const createConversation = async () => {
  try {
    const response = await apiClient.post('/api/conversations');
    return response.data;
  } catch (error) {
    console.error('Error creating conversation:', error);
    throw error;
  }
};

/**
 * Get conversation history
 * @param {string} conversationId - Conversation ID
 * @returns {Promise} - Promise with conversation history
 */
export const getConversationHistory = async (conversationId) => {
  try {
    const response = await apiClient.get(`/conversations/${conversationId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching conversation history:', error);
    throw error;
  }
};

/**
 * Get list of user conversations
 * @returns {Promise} - Promise with list of conversations
 */
export const getUserConversations = async () => {
  try {
    const response = await apiClient.get('/conversations');
    return response.data;
  } catch (error) {
    console.error('Error fetching user conversations:', error);
    throw error;
  }
};

/**
 * Mock function for development without backend
 * @param {string} message - User message
 * @returns {Promise} - Promise that resolves with mock response
 */
export const mockAIResponse = (message) => {
  return new Promise((resolve) => {
    // Simulate network delay
    setTimeout(() => {
      // Simple response based on message content
      let response = "I'm analyzing your request. As a medical visual assistant, I can help with image analysis, document review, and answering medical questions.";
      
      if (message.toLowerCase().includes('image')) {
        response = "I've analyzed the image. I can see it's a medical scan. Would you like me to identify any specific features or anomalies?";
      } else if (message.toLowerCase().includes('document')) {
        response = "I've processed the document. It appears to contain medical data. Would you like me to summarize it or extract specific information?";
      } else if (message.toLowerCase().includes('help')) {
        response = "I can help with analyzing medical images, interpreting lab results, reviewing medical documents, and answering medical questions. What would you like assistance with today?";
      }
      
      resolve({ response });
    }, 1500);
  });
};

export default {
  sendMessage,
  uploadImage,
  uploadDocument,
  getImageAnalysis,
  createConversation,
  getConversationHistory,
  getUserConversations,
  mockAIResponse,
}; 