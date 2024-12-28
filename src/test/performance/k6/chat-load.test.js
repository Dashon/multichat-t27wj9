// @ts-check
import { check, sleep } from 'k6'; // v0.45.0
import http from 'k6/http'; // v0.45.0
import ws from 'k6/ws'; // v0.45.0
import { Trend, Counter, Rate } from 'k6/metrics'; // v0.45.0
import { getConfig, getAIAgentConfig } from '../../config/test-config';
import { connect, sendMessage, sendAIQuery } from '../../utils/websocket-client';

// Constants
const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3001';
const VU_RAMP_TIME = '30s';
const TEST_DURATION = '25m';
const AI_AGENT_TYPES = ['@explorer', '@foodie', '@planner'];

// Custom metrics
const messageDeliveryTime = new Trend('message_delivery_time');
const websocketConnections = new Counter('websocket_connections');
const messageThroughput = new Rate('message_throughput');
const aiResponseTime = new Trend('ai_response_time');
const failedDeliveries = new Counter('failed_deliveries');

// Test configuration
export const options = {
  stages: [
    { duration: '5m', target: 100 }, // Ramp up to 100 users
    { duration: '10m', target: 1000 }, // Ramp up to 1000 users
    { duration: '5m', target: 5000 }, // Peak load test
    { duration: '3m', target: 1000 }, // Scale down
    { duration: '2m', target: 0 }, // Ramp down to 0
  ],
  thresholds: {
    'message_delivery_time': ['p95<2000'], // 95% of messages under 2s
    'websocket_connections': ['value>1000'], // Maintain minimum 1000 connections
    'message_throughput': ['rate>1000'], // 1000 messages per second
    'ai_response_time': ['p95<5000'], // AI responses under 5s
    'failed_deliveries': ['count<50'], // Less than 50 failed deliveries
  },
};

/**
 * Test setup function to initialize test data and environment
 */
export function setup() {
  const config = getConfig('performance');
  const aiConfig = getAIAgentConfig();

  // Create test users and groups
  const testData = {
    users: Array(5000).fill(null).map((_, i) => ({
      id: `user_${i}`,
      name: `TestUser${i}`,
      token: `test_token_${i}`
    })),
    groups: Array(100).fill(null).map((_, i) => ({
      id: `group_${i}`,
      name: `TestGroup${i}`,
      aiAgents: AI_AGENT_TYPES
    }))
  };

  return {
    config,
    aiConfig,
    testData,
    baseUrl: BASE_URL,
    wsUrl: WS_URL
  };
}

/**
 * Main test function executed for each virtual user
 * @param {object} data - Test context data
 */
export default function(data) {
  const { config, testData } = data;
  const userId = `user_${__VU}`;
  const groupId = `group_${__VU % 100}`;

  // Establish WebSocket connection
  const wsConnection = ws.connect(`${data.wsUrl}/chat`, {
    headers: { 'Authorization': `Bearer ${testData.users[__VU % 5000].token}` },
    tags: { userId, groupId }
  }, function(socket) {
    websocketConnections.add(1);

    // Join chat group
    socket.on('open', () => {
      socket.send(JSON.stringify({
        event: 'join_group',
        data: { groupId }
      }));
    });

    // Message handling
    socket.on('message', (message) => {
      const data = JSON.parse(message);
      if (data.error) {
        failedDeliveries.add(1);
      } else {
        messageDeliveryTime.add(Date.now() - data.timestamp);
        messageThroughput.add(1);
      }
    });

    // AI response handling
    socket.on('ai_response', (response) => {
      const data = JSON.parse(response);
      aiResponseTime.add(Date.now() - data.queryTimestamp);
    });

    // Regular message sending
    const sendRegularMessage = () => {
      const timestamp = Date.now();
      socket.send(JSON.stringify({
        event: 'chat_message',
        data: {
          groupId,
          content: `Test message from ${userId} at ${timestamp}`,
          timestamp
        }
      }));
    };

    // AI interaction
    const sendAIQuery = () => {
      const timestamp = Date.now();
      const aiAgent = AI_AGENT_TYPES[Math.floor(Math.random() * AI_AGENT_TYPES.length)];
      socket.send(JSON.stringify({
        event: 'ai_query',
        data: {
          groupId,
          agent: aiAgent,
          query: `Test query for ${aiAgent} from ${userId}`,
          timestamp
        }
      }));
    };

    // Execute test scenarios
    const testDuration = 60; // 1 minute per iteration
    const startTime = Date.now();

    while ((Date.now() - startTime) < testDuration * 1000) {
      if (Math.random() < 0.8) { // 80% regular messages
        sendRegularMessage();
        sleep(1);
      } else { // 20% AI queries
        sendAIQuery();
        sleep(2); // Longer delay for AI interactions
      }
    }
  });

  check(wsConnection, {
    'WebSocket connection established': (conn) => conn !== null,
  });
}

/**
 * Test teardown function for cleanup
 * @param {object} data - Test context data
 */
export function teardown(data) {
  // Cleanup test data
  const cleanupRequests = [
    { method: 'DELETE', url: `${data.baseUrl}/api/test/users` },
    { method: 'DELETE', url: `${data.baseUrl}/api/test/groups` }
  ];

  const responses = http.batch(cleanupRequests);
  check(responses, {
    'Cleanup successful': (res) => res.every(r => r.status === 200)
  });
}