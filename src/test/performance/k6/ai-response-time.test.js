// @ts-check
import { check, sleep } from 'k6'; // ^0.45.0
import http from 'k6/http'; // ^0.45.0
import { Rate, Trend } from 'k6/metrics'; // ^0.45.0
import { getTestConfig } from '../../config/test-config'; // Internal import

// Performance test constants
const AI_RESPONSE_THRESHOLD = 5000; // 5 seconds max response time
const VU_COUNT = 100; // Virtual user count
const TEST_DURATION = '300s'; // 5 minutes test duration
const RAMP_UP_DURATION = '60s'; // 1 minute ramp-up
const WARM_UP_DURATION = '30s'; // 30 seconds warm-up

// Custom metrics
const aiResponseTime = new Trend('ai_response_time');
const aiResponseSuccess = new Rate('ai_response_success');
const aiResponseSize = new Trend('ai_response_size');
const messageProcessingTime = new Trend('message_processing_time');

// Test configuration
export const options = {
  stages: [
    { duration: WARM_UP_DURATION, target: Math.floor(VU_COUNT * 0.2) }, // Warm-up with 20% load
    { duration: RAMP_UP_DURATION, target: VU_COUNT }, // Ramp up to full load
    { duration: TEST_DURATION, target: VU_COUNT }, // Maintain full load
    { duration: '30s', target: 0 } // Graceful ramp-down
  ],
  thresholds: {
    'ai_response_time': [
      { threshold: `p95<${AI_RESPONSE_THRESHOLD}`, abortOnFail: true },
      { threshold: 'p99<6000', abortOnFail: false }
    ],
    'ai_response_success': ['rate>0.99'],
    'http_req_duration': ['p95<2000'], // General API response time SLA
    'http_req_failed': ['rate<0.01'] // Error rate threshold
  }
};

/**
 * Test setup function to initialize test data and configuration
 */
export function setup() {
  const config = getTestConfig('performance');
  
  // Test message templates with AI mentions
  const messageTemplates = [
    '@foodie What are the best restaurants near the Louvre?',
    '@explorer Suggest tourist attractions in Paris',
    '@planner Create an itinerary for tomorrow',
    '@budget Estimate costs for a 3-day trip'
  ];

  // Test user pool for authentication
  const testUsers = Array(VU_COUNT).fill(null).map((_, index) => ({
    id: `test-user-${index}`,
    token: `test-token-${index}`,
    chatGroup: `test-group-${Math.floor(index / 10)}` // 10 users per group
  }));

  return {
    config,
    messageTemplates,
    testUsers,
    apiEndpoint: __ENV.API_URL || 'http://localhost:3000',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };
}

/**
 * Process and validate AI agent response
 * @param {object} response - HTTP response object
 * @returns {boolean} - Validation result
 */
export function handleAIResponse(response) {
  const startTime = Date.now();
  let valid = true;

  try {
    check(response, {
      'status is 200': (r) => r.status === 200,
      'has valid response structure': (r) => {
        const body = r.json();
        return body.content && body.agentId && body.timestamp;
      },
      'response time within threshold': (r) => {
        const responseTime = r.timings.duration;
        aiResponseTime.add(responseTime);
        return responseTime < AI_RESPONSE_THRESHOLD;
      }
    });

    // Record response metrics
    const body = response.json();
    aiResponseSize.add(response.body.length);
    messageProcessingTime.add(Date.now() - startTime);

  } catch (error) {
    console.error(`AI response validation failed: ${error.message}`);
    valid = false;
  }

  aiResponseSuccess.add(valid);
  return valid;
}

/**
 * Main test function executed for each virtual user
 * @param {object} data - Test context data from setup
 */
export default function(data) {
  // Skip metrics during warm-up
  const inWarmup = __VU <= Math.floor(VU_COUNT * 0.2) && __ITER === 0;
  
  // Get test user context
  const user = data.testUsers[__VU % data.testUsers.length];
  const messageTemplate = data.messageTemplates[Math.floor(Math.random() * data.messageTemplates.length)];

  // Prepare request payload
  const payload = JSON.stringify({
    chatId: user.chatGroup,
    content: messageTemplate,
    timestamp: new Date().toISOString(),
    userId: user.id
  });

  // Send message with AI mention
  const headers = {
    ...data.headers,
    'Authorization': `Bearer ${user.token}`
  };

  const response = http.post(`${data.apiEndpoint}/api/v1/messages`, payload, {
    headers,
    tags: { type: 'ai_message' }
  });

  // Validate AI response if not in warm-up
  if (!inWarmup) {
    handleAIResponse(response);
  }

  // Add random think time between requests (1-3 seconds)
  sleep(Math.random() * 2 + 1);
}