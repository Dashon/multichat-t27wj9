/**
 * @fileoverview A highly accessible, theme-aware Modal component following Material Design 3 principles
 * Supports animations, keyboard navigation, screen reader compatibility, and responsive design
 * @version 1.0.0
 */

import React, { useEffect, useCallback, useRef } from 'react';
import { styled, useTheme } from '@mui/material/styles';
import { Portal, FocusTrap } from '@mui/material';

// Internal imports for theming and animations
import { fadeIn, fadeOut, scaleIn } from '../../styles/animations';

// Constants for modal configuration
const MODAL_CONFIG = {
  Z_INDEX: {
    BACKDROP: 1200,
    MODAL: 1300,
    NESTED: 1400,
  },
  ANIMATION: {
    DURATION: 300,
    DURATION_REDUCED: 150,
  },
  FOCUS: {
    OUTLINE_WIDTH: '2px',
    OUTLINE_OFFSET: '2px',
    TRAP_PADDING: '6px',
  },
} as const;

// Interface for Modal props
interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  fullScreen?: boolean;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  hideBackdrop?: boolean;
  ariaLabel?: string;
  disableAnimation?: boolean;
  role?: string;
  keepMounted?: boolean;
  transitionProps?: {
    onEnter?: () => void;
    onExited?: () => void;
  };
}

// Styled components
const StyledBackdrop = styled('div')<{ open: boolean }>(({ theme, open }) => ({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: theme.palette.mode === 'light' 
    ? 'rgba(0, 0, 0, 0.5)' 
    : 'rgba(0, 0, 0, 0.7)',
  zIndex: MODAL_CONFIG.Z_INDEX.BACKDROP,
  opacity: open ? 1 : 0,
  transition: theme.transitions.create('opacity', {
    duration: theme.transitions.duration.standard,
  }),
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
}));

const StyledModal = styled('div')<{
  maxWidth?: string;
  fullScreen?: boolean;
}>(({ theme, maxWidth, fullScreen }) => ({
  position: 'fixed',
  top: fullScreen ? 0 : '50%',
  left: fullScreen ? 0 : '50%',
  right: fullScreen ? 0 : 'auto',
  bottom: fullScreen ? 0 : 'auto',
  transform: fullScreen ? 'none' : 'translate(-50%, -50%)',
  backgroundColor: theme.palette.background.paper,
  borderRadius: fullScreen ? 0 : theme.shape.borderRadius,
  boxShadow: theme.shadows[24],
  outline: 'none',
  padding: theme.spacing(3),
  maxWidth: fullScreen ? '100%' : theme.breakpoints.values[maxWidth || 'sm'],
  width: fullScreen ? '100%' : 'calc(100% - 32px)',
  maxHeight: fullScreen ? '100%' : 'calc(100vh - 64px)',
  overflowY: 'auto',
  zIndex: MODAL_CONFIG.Z_INDEX.MODAL,
  animation: `${fadeIn.keyframes} ${MODAL_CONFIG.ANIMATION.DURATION}ms ${theme.transitions.easing.easeOut}, ${scaleIn.keyframes} ${MODAL_CONFIG.ANIMATION.DURATION}ms ${theme.transitions.easing.easeOut}`,

  // High contrast mode support
  '@media (forced-colors: active)': {
    borderWidth: '2px',
    borderStyle: 'solid',
  },

  // Reduced motion support
  '@media (prefers-reduced-motion: reduce)': {
    animation: 'none',
    transition: 'none',
  },

  // Focus styles
  '&:focus-visible': {
    outline: `${MODAL_CONFIG.FOCUS.OUTLINE_WIDTH} solid ${theme.palette.primary.main}`,
    outlineOffset: MODAL_CONFIG.FOCUS.OUTLINE_OFFSET,
  },
}));

const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  children,
  title,
  fullScreen = false,
  maxWidth = 'sm',
  hideBackdrop = false,
  ariaLabel,
  disableAnimation = false,
  role = 'dialog',
  keepMounted = false,
  transitionProps,
}) => {
  const theme = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  // Handle keyboard events
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  // Handle backdrop clicks
  const handleBackdropClick = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Manage focus and keyboard events
  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement;
      modalRef.current?.focus();
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        previousFocus.current?.focus();
      };
    }
  }, [open, handleKeyDown]);

  // Handle body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  if (!open && !keepMounted) {
    return null;
  }

  return (
    <Portal>
      {!hideBackdrop && (
        <StyledBackdrop
          open={open}
          onClick={handleBackdropClick}
          aria-hidden="true"
        />
      )}
      <FocusTrap open={open}>
        <StyledModal
          ref={modalRef}
          maxWidth={maxWidth}
          fullScreen={fullScreen}
          role={role}
          aria-label={ariaLabel || title}
          aria-modal="true"
          tabIndex={-1}
          {...transitionProps}
        >
          {children}
        </StyledModal>
      </FocusTrap>
    </Portal>
  );
};

export default Modal;