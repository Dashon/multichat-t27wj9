// @ts-check
import { check, sleep } from 'k6'; // ^0.45.0
import http from 'k6/http'; // ^0.45.0
import ws from 'k6/ws'; // ^0.45.0
import { Rate, Trend, Counter, Gauge } from 'k6/metrics'; // ^0.45.0
import { getConfig } from '../../config/test-config';
import { getWebSocketConfig } from '../../../backend/message-service/src/config/websocket.config';

// Global constants from configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3001';
const TARGET_THROUGHPUT = parseInt(__ENV.TARGET_THROUGHPUT || '1000');
const TEST_DURATION = __ENV.TEST_DURATION || '5m';
const RAMP_DURATION = __ENV.RAMP_DURATION || '30s';
const VIRTUAL_USERS = parseInt(__ENV.VIRTUAL_USERS || '100');
const CONNECTION_TIMEOUT = parseInt(__ENV.CONNECTION_TIMEOUT || '5000');
const RETRY_ATTEMPTS = parseInt(__ENV.RETRY_ATTEMPTS || '3');

// Custom metrics
const messageSendRate = new Rate('message_send_rate');
const messageDeliveryTime = new Trend('message_delivery_time');
const messageSuccessRate = new Rate('message_success_rate');
const websocketErrors = new Counter('websocket_errors');
const aiResponseTime = new Trend('ai_response_time');
const connectionPoolUsage = new Gauge('connection_pool_usage');

// Test configuration
export const options = {
  stages: [
    { duration: RAMP_DURATION, target: VIRTUAL_USERS }, // Ramp up
    { duration: TEST_DURATION, target: VIRTUAL_USERS }, // Full load
    { duration: RAMP_DURATION, target: 0 }, // Ramp down
  ],
  thresholds: {
    'message_send_rate': [`rate>=${TARGET_THROUGHPUT}`],
    'message_delivery_time': ['p95<2000'], // 95th percentile under 2s
    'message_success_rate': ['rate>0.99'], // 99% success rate
    'websocket_errors': ['count<50'],
    'ai_response_time': ['p95<3000'],
    'connection_pool_usage': ['value<0.9'],
  },
  setupTimeout: '1m',
};

/**
 * Test setup function to prepare the environment
 */
export function setup() {
  const config = getConfig('performance');
  const wsConfig = getWebSocketConfig();

  // Validate configuration
  if (!config || !wsConfig) {
    throw new Error('Failed to load test configuration');
  }

  return {
    config,
    wsConfig,
    testGroups: generateTestGroups(),
    testMessages: generateTestMessages(),
  };
}

/**
 * Main test function
 * @param {Object} data - Test data from setup
 */
export default function(data) {
  const { config, wsConfig, testGroups, testMessages } = data;

  // WebSocket connection with retries
  let socket;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      socket = ws.connect(WS_URL, {
        timeout: CONNECTION_TIMEOUT,
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      }, function(socket) {
        // Connection handlers
        socket.on('open', () => {
          connectionPoolUsage.add(1);
        });

        socket.on('message', (data) => {
          const message = JSON.parse(data);
          const deliveryTime = Date.now() - message.timestamp;
          messageDeliveryTime.add(deliveryTime);
          messageSuccessRate.add(1);

          if (message.type === 'ai_response') {
            aiResponseTime.add(message.processingTime);
          }
        });

        socket.on('error', () => {
          websocketErrors.add(1);
        });

        socket.on('close', () => {
          connectionPoolUsage.add(-1);
        });
      });

      break;
    } catch (error) {
      console.error(`Connection attempt ${attempt + 1} failed: ${error.message}`);
      if (attempt === RETRY_ATTEMPTS - 1) {
        throw error;
      }
      sleep(1);
    }
  }

  // Send messages at target rate
  const messageInterval = 1 / (TARGET_THROUGHPUT / VIRTUAL_USERS);
  const testGroup = testGroups[__VU % testGroups.length];
  const messages = testMessages[__VU % testMessages.length];

  for (const message of messages) {
    const startTime = Date.now();

    try {
      socket.send(JSON.stringify({
        type: 'chat_message',
        groupId: testGroup.id,
        content: message,
        timestamp: startTime,
        metadata: {
          userId: `user_${__VU}`,
          messageType: 'text',
          testIteration: __ITER,
        },
      }));

      messageSendRate.add(1);
      sleep(messageInterval);
    } catch (error) {
      websocketErrors.add(1);
      console.error(`Message send failed: ${error.message}`);
    }
  }

  socket.close();
}

/**
 * Test cleanup function
 */
export function teardown(data) {
  // Cleanup resources and export metrics
  console.log('Test completed. Cleaning up...');
}

/**
 * Generate test groups for the performance test
 * @returns {Array<Object>} Array of test groups
 */
function generateTestGroups() {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `test_group_${i}`,
    name: `Test Group ${i}`,
    participants: Array.from({ length: 50 }, (_, j) => `user_${j}`),
  }));
}

/**
 * Generate test messages with varying patterns
 * @returns {Array<Array<string>>} Array of message arrays
 */
function generateTestMessages() {
  const messagePatterns = [
    'Hello, how are you?',
    '@ai_agent What\'s the weather like?',
    'Let\'s schedule a meeting',
    'Has anyone seen the latest updates?',
    'Great progress everyone!',
  ];

  return Array.from({ length: VIRTUAL_USERS }, () =>
    Array.from({ length: 100 }, () =>
      messagePatterns[Math.floor(Math.random() * messagePatterns.length)]
    )
  );
}

/**
 * Get authentication token for WebSocket connection
 * @returns {string} Authentication token
 */
function getAuthToken() {
  const response = http.post(`${BASE_URL}/auth/login`, {
    username: `test_user_${__VU}`,
    password: 'test_password',
  });

  if (response.status !== 200) {
    throw new Error('Authentication failed');
  }

  return JSON.parse(response.body).token;
}