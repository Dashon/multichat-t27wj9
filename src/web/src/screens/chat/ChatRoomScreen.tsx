/**
 * @fileoverview Main chat room screen component implementing real-time messaging,
 * AI agent integration, and group chat features with Material Design 3 principles.
 * @version 1.0.0
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { styled, useTheme } from '@mui/material/styles';
import { Box, IconButton, useMediaQuery, Snackbar, CircularProgress } from '@mui/material';
import { Menu, ArrowBack, Error } from '@mui/icons-material';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

// Internal imports
import ChatRoom from '../../components/chat/ChatRoom';
import AgentPanel from '../../components/ai/AgentPanel';
import { useChat } from '../../hooks/useChat';

// Styled components with Material Design 3 principles
const ChatRoomContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  backgroundColor: theme.palette.background.default,
  position: 'relative',
  overflow: 'hidden',
}));

const ContentContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
  position: 'relative',
  gap: theme.spacing(2),
}));

const MainContent = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'withPanel',
})<{ withPanel: boolean }>(({ theme, withPanel }) => ({
  flex: 1,
  transition: theme.transitions.create('margin', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  marginRight: withPanel ? 320 : 0, // AgentPanel width
  [theme.breakpoints.down('md')]: {
    marginRight: 0,
  },
}));

// Props interface
interface ChatRoomScreenProps {
  onlineStatus: boolean;
  initialAgentPanelState?: boolean;
}

/**
 * ChatRoomScreen component implementing the main chat interface
 */
const ChatRoomScreen: React.FC<ChatRoomScreenProps> = ({
  onlineStatus,
  initialAgentPanelState = false,
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { chatId } = useParams<{ chatId: string }>();
  const location = useLocation();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  // State management
  const [agentPanelOpen, setAgentPanelOpen] = useState(initialAgentPanelState);
  const [error, setError] = useState<string | null>(null);
  
  // Hooks
  const {
    chat,
    loading,
    error: chatError,
    connectionStatus,
    sendMessage,
    retryFailedMessages,
  } = useChat(chatId!, {
    autoConnect: true,
    enableOfflineSupport: true,
    enableTypingIndicators: true,
  });

  // Refs for performance optimization
  const previousChatId = useRef<string>();

  /**
   * Handles navigation back to chat list
   */
  const handleBack = useCallback(() => {
    navigate('/chats');
  }, [navigate]);

  /**
   * Toggles AI agent panel visibility
   */
  const handleAgentPanelToggle = useCallback(() => {
    setAgentPanelOpen((prev) => !prev);
  }, []);

  /**
   * Handles error display and retry logic
   */
  const handleError = useCallback((error: string) => {
    setError(error);
    setTimeout(() => setError(null), 5000);
  }, []);

  // Effect to handle chat ID changes
  useEffect(() => {
    if (chatId !== previousChatId.current) {
      previousChatId.current = chatId;
      if (isMobile) {
        setAgentPanelOpen(false);
      }
    }
  }, [chatId, isMobile]);

  // Loading state
  if (loading && !chat) {
    return (
      <ChatRoomContainer>
        <Box display="flex" justifyContent="center" alignItems="center" height="100%">
          <CircularProgress size={40} />
        </Box>
      </ChatRoomContainer>
    );
  }

  return (
    <ChatRoomContainer>
      <ContentContainer>
        <MainContent withPanel={agentPanelOpen && !isMobile}>
          <ChatRoom
            chatId={chatId!}
            onBack={handleBack}
            onError={handleError}
            onAgentTrigger={handleAgentPanelToggle}
            connectionStatus={connectionStatus}
          />
        </MainContent>

        <AgentPanel
          agents={[
            { id: 'foodie', name: 'Foodie', type: 'AI' },
            { id: 'explorer', name: 'Explorer', type: 'AI' },
            { id: 'planner', name: 'Planner', type: 'AI' },
          ]}
          isOpen={agentPanelOpen}
          onClose={() => setAgentPanelOpen(false)}
          onAgentSelect={(agent) => {
            sendMessage(`@${agent.name.toLowerCase()} `);
            if (isMobile) {
              setAgentPanelOpen(false);
            }
          }}
        />
      </ContentContainer>

      {/* Error Snackbar */}
      <Snackbar
        open={!!error || !!chatError}
        autoHideDuration={5000}
        onClose={() => setError(null)}
        message={error || chatError}
        action={
          <IconButton
            size="small"
            color="inherit"
            onClick={() => setError(null)}
          >
            <Error />
          </IconButton>
        }
      />
    </ChatRoomContainer>
  );
};

export default React.memo(ChatRoomScreen);